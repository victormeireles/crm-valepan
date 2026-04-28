"use server";

import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { revalidatePath } from "next/cache";
import { isNetworkTypeOption } from "@/lib/network-types";
import { isSendViaOption } from "@/lib/send-via-options";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

export async function createLead(formData: FormData) {
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const source = String(formData.get("source") ?? "manual").trim() || "manual";
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const rawCategory = String(formData.get("client_category") ?? "").trim();
  const clientCategory = rawCategory.length > 0 ? rawCategory : null;
  const normalized = normalizeBrazilPhoneToE164(rawPhone);
  if (!normalized) {
    return { ok: false as const, error: "Telefone inválido." };
  }
  if (
    clientCategory &&
    !ALLOWED_CLIENT_CATEGORIES.includes(clientCategory as (typeof ALLOWED_CLIENT_CATEGORIES)[number])
  ) {
    return { ok: false as const, error: "Categoria inválida." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: existing } = await crm
    .from("leads")
    .select("id")
    .eq("phone_e164", normalized)
    .maybeSingle();
  if (existing?.id) {
    return { ok: false as const, error: "Já existe lead para este telefone." };
  }

  const { data: inserted, error } = await crm
    .from("leads")
    .insert({
      phone_e164: normalized,
      source,
      status: "open",
      owner_id: user.id,
      client_category: clientCategory,
    })
    .select("id, contact_id")
    .single();

  if (error || !inserted) {
    return { ok: false as const, error: error?.message ?? "Erro ao criar lead." };
  }

  if (contactName) {
    let nextContactId = inserted.contact_id ?? null;
    if (nextContactId) {
      await crm
        .from("contacts")
        .update({
          full_name: contactName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nextContactId);
    } else {
      const { data: byPhone } = await crm
        .from("contacts")
        .select("id")
        .eq("phone_e164", normalized)
        .maybeSingle();
      if (byPhone?.id) {
        nextContactId = byPhone.id;
        await crm
          .from("contacts")
          .update({
            full_name: contactName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextContactId);
      } else {
        const { data: insertedContact } = await crm
          .from("contacts")
          .insert({
            phone_e164: normalized,
            full_name: contactName,
          })
          .select("id")
          .single();
        nextContactId = insertedContact?.id ?? null;
      }
    }
    if (nextContactId) {
      await crm
        .from("leads")
        .update({
          contact_id: nextContactId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }
  }

  const { data: firstStage } = await crm
    .from("pipeline_stages")
    .select("id")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstStage?.id) {
    await crm.from("opportunities").insert({
      lead_id: inserted.id,
      stage_id: firstStage.id,
      title: `Lead ${normalized}`,
      owner_id: user.id,
    });
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: inserted.id,
    action: "created_manual",
    actor_id: user.id,
    payload: { source, phone: normalized },
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const, id: inserted.id };
}

const ALLOWED_CLIENT_CATEGORIES = ["hamburgueria", "distribuidor", "parceiros", "outros"] as const;

export async function updateLeadClientCategory(input: { leadId: string; category: string | null }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const raw = input.category?.trim() ?? "";
  const category = raw.length === 0 ? null : raw;
  if (category && !ALLOWED_CLIENT_CATEGORIES.includes(category as (typeof ALLOWED_CLIENT_CATEGORIES)[number])) {
    return { ok: false as const, error: "Categoria inválida." };
  }

  const { data: updated, error } = await crm
    .from("leads")
    .update({
      client_category: category,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.leadId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível salvar a categoria." };

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/leads");
  return { ok: true as const };
}

export async function updateLeadCategoryContactInfo(input: {
  leadId: string | null;
  clientCategory: string;
  distributorName: string | null;
  networkType: string | null;
  contactName: string;
  leadPhone: string;
  city: string;
  companyDocument: string;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const rawLeadId = input.leadId?.trim() ?? "";

  const distributorName = input.distributorName?.trim().toUpperCase() || null;
  const networkType = input.networkType?.trim().toLowerCase() || null;
  if (networkType && !isNetworkTypeOption(networkType)) {
    return { ok: false as const, error: "Tipo inválido." };
  }
  const contactName = input.contactName.trim();
  const leadPhoneRaw = input.leadPhone.trim();
  const normalizedLeadPhone = leadPhoneRaw ? normalizeBrazilPhoneToE164(leadPhoneRaw) : null;
  if (leadPhoneRaw && !normalizedLeadPhone) {
    return { ok: false as const, error: "Telefone inválido." };
  }
  const city = input.city.trim();
  const companyDocument = input.companyDocument.trim() || null;

  let leadId = rawLeadId;
  if (!leadId) {
    if (!normalizedLeadPhone) {
      return { ok: false as const, error: "Informe um telefone válido para criar o contato." };
    }
    const { data: byPhone } = await crm
      .from("leads")
      .select("id")
      .eq("phone_e164", normalizedLeadPhone)
      .maybeSingle();
    if (byPhone?.id) {
      leadId = byPhone.id;
    } else {
      const { data: insertedLead, error: insertedLeadErr } = await crm
        .from("leads")
        .insert({
          phone_e164: normalizedLeadPhone,
          source: "manual",
          status: "open",
          owner_id: user.id,
          client_category: input.clientCategory,
          network_type: networkType,
        })
        .select("id")
        .single();
      if (insertedLeadErr || !insertedLead) {
        return { ok: false as const, error: insertedLeadErr?.message ?? "Erro ao criar lead." };
      }
      leadId = insertedLead.id;
    }
  }

  const { data: lead } = await crm
    .from("leads")
    .select("id, phone_e164, contact_id, company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.id) return { ok: false as const, error: "Lead não encontrado." };

  if (distributorName && distributorName.length > 80) {
    return { ok: false as const, error: "Distribuidora muito longa (máximo 80 caracteres)." };
  }

  let distributorId: string | null = null;
  if (distributorName) {
    const { data: dist } = await crm
      .from("distributors")
      .select("id, name")
      .ilike("name", distributorName)
      .maybeSingle();
    if (dist?.id) {
      distributorId = dist.id;
    } else {
      const { data: insertedDist, error: insertedDistErr } = await crm
        .from("distributors")
        .insert({ name: distributorName, active: true })
        .select("id")
        .single();
      if (insertedDistErr || !insertedDist) {
        return {
          ok: false as const,
          error: insertedDistErr?.message ?? "Erro ao vincular distribuidora.",
        };
      }
      distributorId = insertedDist.id;
    }
  }

  let nextContactId = lead.contact_id;
  const targetPhone = normalizedLeadPhone ?? lead.phone_e164;
  if (nextContactId) {
    const { data: byPhone } = await crm
      .from("contacts")
      .select("id")
      .eq("phone_e164", targetPhone)
      .maybeSingle();

    if (byPhone?.id && byPhone.id !== nextContactId) {
      nextContactId = byPhone.id;
      const { error: mergeContactErr } = await crm
        .from("contacts")
        .update({
          full_name: contactName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nextContactId);
      if (mergeContactErr) return { ok: false as const, error: mergeContactErr.message };
    } else {
      const { error: contactErr } = await crm
        .from("contacts")
        .update({
          full_name: contactName || null,
          phone_e164: targetPhone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nextContactId);
      if (contactErr) {
        const code = (contactErr as { code?: string }).code;
        const isPhoneUniqueConflict =
          code === "23505" || /contacts_phone_e164_key/i.test(contactErr.message ?? "");
        if (isPhoneUniqueConflict) {
          const { error: retryWithoutPhoneErr } = await crm
            .from("contacts")
            .update({
              full_name: contactName || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", nextContactId);
          if (retryWithoutPhoneErr) {
            return { ok: false as const, error: retryWithoutPhoneErr.message };
          }
        } else {
          return { ok: false as const, error: contactErr.message };
        }
      }
    }
  } else if (contactName) {
    const { data: existingContact } = await crm
      .from("contacts")
      .select("id")
      .eq("phone_e164", targetPhone)
      .maybeSingle();

    if (existingContact?.id) {
      nextContactId = existingContact.id;
      const { error: contactByPhoneErr } = await crm
        .from("contacts")
        .update({
          full_name: contactName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingContact.id);
      if (contactByPhoneErr) return { ok: false as const, error: contactByPhoneErr.message };
    } else {
      const { data: insertedContact, error: insertContactErr } = await crm
        .from("contacts")
        .insert({
          full_name: contactName,
          phone_e164: targetPhone,
        })
        .select("id")
        .single();
      if (insertContactErr || !insertedContact) {
        const code = (insertContactErr as { code?: string } | null)?.code;
        const isPhoneUniqueConflict =
          code === "23505" || /contacts_phone_e164_key/i.test(insertContactErr?.message ?? "");
        if (isPhoneUniqueConflict) {
          const { data: fallbackContact } = await crm
            .from("contacts")
            .select("id")
            .eq("phone_e164", targetPhone)
            .maybeSingle();
          if (!fallbackContact?.id) {
            return { ok: false as const, error: "Telefone já vinculado a outro contato." };
          }
          nextContactId = fallbackContact.id;
          const { error: fallbackUpdateErr } = await crm
            .from("contacts")
            .update({
              full_name: contactName || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fallbackContact.id);
          if (fallbackUpdateErr) return { ok: false as const, error: fallbackUpdateErr.message };
        } else {
          return { ok: false as const, error: insertContactErr?.message ?? "Erro ao criar contato." };
        }
      } else {
        nextContactId = insertedContact.id;
      }
    }
  }

  let nextCompanyId = lead.company_id;
  if (nextCompanyId) {
    const { error: companyErr } = await crm
      .from("companies")
      .update({
        city: city || null,
        document: companyDocument,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nextCompanyId);
    if (companyErr) return { ok: false as const, error: companyErr.message };
  } else if (city) {
    const companyName = contactName || `Empresa ${lead.phone_e164}`;
    const { data: insertedCompany, error: insertCompanyErr } = await crm
      .from("companies")
      .insert({
        name: companyName,
        city,
        document: companyDocument,
      })
      .select("id")
      .single();
    if (insertCompanyErr || !insertedCompany) {
      return { ok: false as const, error: insertCompanyErr?.message ?? "Erro ao criar empresa." };
    }
    nextCompanyId = insertedCompany.id;
  }

  const { data: updated, error } = await crm
    .from("leads")
    .update({
      phone_e164: normalizedLeadPhone ?? lead.phone_e164,
      distributor_id: distributorId,
      network_type: networkType,
      contact_id: nextContactId,
      company_id: nextCompanyId,
      client_category: input.clientCategory,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível salvar as informações." };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const, leadId };
}

export async function updateLeadDistributor(input: {
  leadId: string;
  distributorName: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const leadId = input.leadId.trim();
  if (!leadId) return { ok: false as const, error: "Lead inválido." };

  const distributorName = input.distributorName?.trim().toUpperCase() || null;
  if (distributorName && !isSendViaOption(distributorName)) {
    return { ok: false as const, error: "Distribuidora inválida." };
  }

  let distributorId: string | null = null;
  if (distributorName) {
    const { data: dist } = await crm
      .from("distributors")
      .select("id")
      .ilike("name", distributorName)
      .maybeSingle();
    if (dist?.id) {
      distributorId = dist.id;
    } else {
      const { data: inserted, error: insertErr } = await crm
        .from("distributors")
        .insert({ name: distributorName, active: true })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        return { ok: false as const, error: insertErr?.message ?? "Erro ao salvar distribuidora." };
      }
      distributorId = inserted.id;
    }
  }

  const { data: updated, error } = await crm
    .from("leads")
    .update({
      distributor_id: distributorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível salvar a distribuidora." };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}
