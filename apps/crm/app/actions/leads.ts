"use server";

import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { revalidatePath } from "next/cache";
import { isNetworkTypeOption } from "@/lib/network-types";
import { isSendViaOption } from "@/lib/send-via-options";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

function isMissingNetworkTypeError(err: { message?: string; code?: string } | null | undefined) {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("network_type") && msg.includes("schema cache");
}

function isLeadPhoneUniqueConflict(err: { message?: string; code?: string } | null | undefined) {
  const msg = (err?.message ?? "").toLowerCase();
  const code = err?.code ?? "";
  return code === "23505" || msg.includes("idx_leads_phone_unique");
}

function generateDraftLeadPhoneE164() {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 90 + 10).toString();
  return `+55${rand}${now}`;
}

export async function createLead(formData: FormData) {
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const source = String(formData.get("source") ?? "manual").trim() || "manual";
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const rawCategory = String(formData.get("client_category") ?? "").trim();
  const rawDistributorName = String(formData.get("distributor_name") ?? "").trim().toUpperCase();
  const baseCategory = rawCategory.length > 0 ? rawCategory : null;
  const clientCategory = rawDistributorName ? "distribuidor" : baseCategory;
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

  if (clientCategory === "distribuidor") {
    const upsertRes = await updateLeadCategoryContactInfo({
      leadId: null,
      clientCategory: "distribuidor",
      distributorName: rawDistributorName || null,
      leadStatus: null,
      networkType: null,
      contactName,
      leadPhone: rawPhone,
      city: null,
      companyDocument: null,
    });
    if (!upsertRes.ok) {
      return { ok: false as const, error: upsertRes.error ?? "Erro ao incluir lead." };
    }

    const supabase = await createServerSupabaseClient();
    const crm = crmTables(supabase);
    const createdLeadId = upsertRes.leadId ?? "";
    if (createdLeadId) {
      const { data: dist } = rawDistributorName
        ? await crm
            .from("distributors")
            .select("id")
            .ilike("name", rawDistributorName)
            .maybeSingle()
        : { data: null };

      const { data: leadSnapshot } = await crm
        .from("leads")
        .select("id, client_category, distributor_id")
        .eq("id", createdLeadId)
        .maybeSingle();

      const needsFixCategory = (leadSnapshot?.client_category ?? "").trim().toLowerCase() !== "distribuidor";
      const needsFixDistributor = !!rawDistributorName && !leadSnapshot?.distributor_id;
      if (needsFixCategory || needsFixDistributor) {
        await crm
          .from("leads")
          .update({
            client_category: "distribuidor",
            distributor_id: dist?.id ?? leadSnapshot?.distributor_id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", createdLeadId);
      }
    }

    revalidatePath("/leads", "page");
    revalidatePath("/leads", "layout");
    return { ok: true as const, id: createdLeadId };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  let distributorId: string | null = null;
  if (clientCategory === "distribuidor" && rawDistributorName) {
    const { data: dist, error: distErr } = await crm
      .from("distributors")
      .select("id")
      .ilike("name", rawDistributorName)
      .maybeSingle();
    if (distErr) return { ok: false as const, error: distErr.message };
    if (dist?.id) {
      distributorId = dist.id;
    } else {
      const { data: insertedDist, error: insertedDistErr } = await crm
        .from("distributors")
        .insert({ name: rawDistributorName, active: true })
        .select("id")
        .single();
      if (insertedDistErr || !insertedDist) {
        return { ok: false as const, error: insertedDistErr?.message ?? "Erro ao vincular rede." };
      }
      distributorId = insertedDist.id;
    }
  }
  const { data: existing } = await crm
    .from("leads")
    .select("id, contact_id")
    .eq("phone_e164", normalized)
    .maybeSingle();
  if (existing?.id) {
    const { error: existingUpdateErr } = await crm
      .from("leads")
      .update({
        client_category: clientCategory ?? "distribuidor",
        distributor_id: distributorId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (existingUpdateErr) {
      return { ok: false as const, error: existingUpdateErr.message };
    }

    if (contactName) {
      let nextContactId = existing.contact_id ?? null;
      if (nextContactId) {
        const { error: contactErr } = await crm
          .from("contacts")
          .update({
            full_name: contactName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextContactId);
        if (contactErr) return { ok: false as const, error: contactErr.message };
      } else {
        const { data: byPhone } = await crm
          .from("contacts")
          .select("id")
          .eq("phone_e164", normalized)
          .maybeSingle();
        if (byPhone?.id) {
          nextContactId = byPhone.id;
          const { error: byPhoneErr } = await crm
            .from("contacts")
            .update({
              full_name: contactName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", nextContactId);
          if (byPhoneErr) return { ok: false as const, error: byPhoneErr.message };
        } else {
          const { data: insertedContact, error: insertedContactErr } = await crm
            .from("contacts")
            .insert({
              phone_e164: normalized,
              full_name: contactName,
            })
            .select("id")
            .single();
          if (insertedContactErr || !insertedContact) {
            return { ok: false as const, error: insertedContactErr?.message ?? "Erro ao salvar contato." };
          }
          nextContactId = insertedContact.id;
        }
      }

      if (nextContactId) {
        const { error: bindContactErr } = await crm
          .from("leads")
          .update({
            contact_id: nextContactId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (bindContactErr) return { ok: false as const, error: bindContactErr.message };
      }
    }

    revalidatePath("/leads");
    revalidatePath(`/leads/${existing.id}`);
    return { ok: true as const, id: existing.id };
  }

  const { data: inserted, error } = await crm
    .from("leads")
    .insert({
      phone_e164: normalized,
      source,
      status: "open",
      owner_id: user.id,
      client_category: clientCategory,
      distributor_id: distributorId,
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
const ALLOWED_LEAD_STATUSES = ["em negociação", "cliente"] as const;

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

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function extractCnpjFromText(input: string | null | undefined): string | null {
  const text = String(input ?? "");
  const matches = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g);
  if (!matches || matches.length === 0) return null;
  for (const m of matches) {
    const digits = m.replace(/\D/g, "");
    if (digits.length === 14) return digits;
  }
  return null;
}

export async function syncLeadToDistributorCategory(input: { leadId: string }) {
  const leadId = input.leadId.trim();
  if (!leadId) return { ok: false as const, error: "Lead inválido." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: lead, error: leadErr } = await crm
    .from("leads")
    .select(
      "id, phone_e164, network_type, contacts(full_name), companies(city,document), distributors(name)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { ok: false as const, error: leadErr.message };
  if (!lead?.id) return { ok: false as const, error: "Lead não encontrado." };

  const contact = firstOrNull(lead.contacts as { full_name: string | null } | { full_name: string | null }[] | null);
  const company = firstOrNull(
    lead.companies as { city: string | null; document: string | null } | { city: string | null; document: string | null }[] | null,
  );
  const distributor = firstOrNull(
    lead.distributors as { name: string | null } | { name: string | null }[] | null,
  );

  let companyDocument = (company?.document ?? "").trim();
  if (!companyDocument) {
    const { data: convRows, error: convErr } = await crm
      .from("conversations")
      .select("id")
      .eq("lead_id", lead.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (convErr) return { ok: false as const, error: convErr.message };

    const conversationId = convRows?.[0]?.id ?? null;
    if (conversationId) {
      const { data: messages, error: msgErr } = await crm
        .from("messages")
        .select("body")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (msgErr) return { ok: false as const, error: msgErr.message };

      for (const msg of messages ?? []) {
        const maybe = extractCnpjFromText((msg as { body?: string | null }).body ?? null);
        if (maybe) {
          companyDocument = maybe;
          break;
        }
      }
    }
  }

  const syncRes = await updateLeadCategoryContactInfo({
    leadId: lead.id,
    clientCategory: "distribuidor",
    distributorName: (distributor?.name ?? "").trim() || null,
    leadStatus: null,
    networkType: (lead.network_type ?? "").trim().toLowerCase() || null,
    contactName: (contact?.full_name ?? "").trim(),
    leadPhone: (lead.phone_e164 ?? "").trim(),
    city: (company?.city ?? "").trim(),
    companyDocument,
  });
  if (!syncRes.ok) {
    return { ok: false as const, error: syncRes.error ?? "Erro ao sincronizar distribuidor." };
  }

  revalidatePath("/inbox");
  revalidatePath("/leads", "page");
  revalidatePath("/leads", "layout");
  return { ok: true as const };
}

export async function updateConversationLeadClientCategory(input: {
  conversationId: string;
  category: string | null;
}) {
  const conversationId = input.conversationId.trim();
  if (!conversationId) return { ok: false as const, error: "Conversa inválida." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: conv, error: convErr } = await crm
    .from("conversations")
    .select("id, lead_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return { ok: false as const, error: convErr.message };
  if (!conv?.lead_id) return { ok: false as const, error: "Conversa sem lead vinculado." };

  const categoryRes = await updateLeadClientCategory({
    leadId: conv.lead_id,
    category: input.category,
  });
  if (!categoryRes.ok) {
    return { ok: false as const, error: categoryRes.error ?? "Erro ao salvar categoria." };
  }

  if ((input.category ?? "").trim().toLowerCase() === "distribuidor") {
    const syncRes = await syncLeadToDistributorCategory({ leadId: conv.lead_id });
    if (!syncRes.ok) {
      return {
        ok: false as const,
        error: syncRes.error ?? "Erro ao sincronizar distribuidor.",
      };
    }
  }

  revalidatePath("/inbox");
  revalidatePath("/leads", "page");
  revalidatePath("/leads", "layout");
  return { ok: true as const };
}

export async function updateLeadCategoryContactInfo(input: {
  leadId: string | null;
  clientCategory: string;
  distributorName: string | null;
  leadStatus?: string | null;
  networkType: string | null;
  contactName?: string | null;
  leadPhone?: string | null;
  city?: string | null;
  companyDocument?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const rawLeadId = input.leadId?.trim() ?? "";

  const distributorName = input.distributorName?.trim().toUpperCase() || null;
  const rawLeadStatus = String(input.leadStatus ?? "").trim().toLowerCase();
  const leadStatus = rawLeadStatus.length > 0 ? rawLeadStatus : null;
  if (
    leadStatus &&
    !ALLOWED_LEAD_STATUSES.includes(leadStatus as (typeof ALLOWED_LEAD_STATUSES)[number])
  ) {
    return { ok: false as const, error: "Status inválido." };
  }
  const networkType = input.networkType?.trim().toLowerCase() || null;
  if (networkType && !isNetworkTypeOption(networkType)) {
    return { ok: false as const, error: "Tipo inválido." };
  }
  const contactName = String(input.contactName ?? "").trim();
  const leadPhoneRaw = String(input.leadPhone ?? "").trim();
  const normalizedLeadPhone = leadPhoneRaw ? normalizeBrazilPhoneToE164(leadPhoneRaw) : null;
  if (leadPhoneRaw && !normalizedLeadPhone) {
    return { ok: false as const, error: "Telefone inválido." };
  }
  const city = String(input.city ?? "").trim();
  const companyDocument = String(input.companyDocument ?? "").trim() || null;

  if (distributorName && distributorName.length > 80) {
    return { ok: false as const, error: "Distribuidora muito longa (máximo 80 caracteres)." };
  }

  let distributorId: string | null = null;
  if (distributorName) {
    const { data: dist, error: distErr } = await crm
      .from("distributors")
      .select("id, name")
      .ilike("name", distributorName)
      .maybeSingle();
    if (distErr) {
      return { ok: false as const, error: distErr.message };
    }
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

  let leadId = rawLeadId;
  if (!leadId) {
    if (input.clientCategory === "distribuidor" && distributorId) {
      const { data: byDistributor, error: byDistributorErr } = await crm
        .from("leads")
        .select("id")
        .eq("client_category", "distribuidor")
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byDistributorErr) {
        return { ok: false as const, error: byDistributorErr.message };
      }
      if (byDistributor?.id) {
        leadId = byDistributor.id;
      }
    }

    if (!leadId && normalizedLeadPhone) {
      const { data: byPhone, error: byPhoneErr } = await crm
        .from("leads")
        .select("id")
        .eq("phone_e164", normalizedLeadPhone)
        .maybeSingle();
      if (byPhoneErr) {
        return { ok: false as const, error: byPhoneErr.message };
      }
      if (byPhone?.id) {
        leadId = byPhone.id;
      }
    }

    if (!leadId) {
      const leadPhoneToCreate = normalizedLeadPhone ?? generateDraftLeadPhoneE164();
      const insertPayloadBase = {
        phone_e164: leadPhoneToCreate,
        source: "manual",
        status: leadStatus ?? "open",
        owner_id: user.id,
        client_category: input.clientCategory,
        distributor_id: distributorId,
      };

      let insertedLead: { id: string } | null = null;
      const firstInsert = await crm
        .from("leads")
        .insert({
          ...insertPayloadBase,
          network_type: networkType,
        })
        .select("id")
        .single();

      if (firstInsert.error && isMissingNetworkTypeError(firstInsert.error)) {
        const fallbackInsert = await crm
          .from("leads")
          .insert(insertPayloadBase)
          .select("id")
          .single();
        if (fallbackInsert.error || !fallbackInsert.data) {
          return {
            ok: false as const,
            error: fallbackInsert.error?.message ?? "Erro ao criar lead.",
          };
        }
        insertedLead = fallbackInsert.data;
      } else if (firstInsert.error || !firstInsert.data) {
        return {
          ok: false as const,
          error: firstInsert.error?.message ?? "Erro ao criar lead.",
        };
      } else {
        insertedLead = firstInsert.data;
      }

      leadId = insertedLead.id;
    }
  }

  if (normalizedLeadPhone) {
    const { data: existingByPhone, error: existingByPhoneErr } = await crm
      .from("leads")
      .select("id")
      .eq("phone_e164", normalizedLeadPhone)
      .maybeSingle();
    if (existingByPhoneErr) {
      return { ok: false as const, error: existingByPhoneErr.message };
    }
    if (existingByPhone?.id && existingByPhone.id !== leadId) {
      // Se o telefone já pertence a outro lead, atualizamos esse lead
      // para evitar violação de unique e manter o salvamento funcional.
      leadId = existingByPhone.id;
    }
  }

  const { data: lead } = await crm
    .from("leads")
    .select("id, phone_e164, status, contact_id, company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.id) return { ok: false as const, error: "Lead não encontrado." };

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
  } else if (city || companyDocument) {
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

  const updatePayloadBase = {
    phone_e164: normalizedLeadPhone ?? lead.phone_e164,
    status: leadStatus ?? lead.status,
    distributor_id: distributorId,
    contact_id: nextContactId,
    company_id: nextCompanyId,
    client_category: input.clientCategory,
    updated_at: new Date().toISOString(),
  };

  const firstUpdate = await crm
    .from("leads")
    .update({
      ...updatePayloadBase,
      network_type: networkType,
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();

  let updated: { id: string } | null = null;
  if (firstUpdate.error && isMissingNetworkTypeError(firstUpdate.error)) {
    const fallbackUpdate = await crm
      .from("leads")
      .update(updatePayloadBase)
      .eq("id", leadId)
      .select("id")
      .maybeSingle();
    if (fallbackUpdate.error) return { ok: false as const, error: fallbackUpdate.error.message };
    updated = fallbackUpdate.data ?? null;
  } else if (firstUpdate.error) {
    if (isLeadPhoneUniqueConflict(firstUpdate.error) && normalizedLeadPhone) {
      const { data: byPhone, error: byPhoneErr } = await crm
        .from("leads")
        .select("id")
        .eq("phone_e164", normalizedLeadPhone)
        .maybeSingle();
      if (byPhoneErr) return { ok: false as const, error: byPhoneErr.message };
      if (byPhone?.id) {
        const retryOnExisting = await crm
          .from("leads")
          .update({
            ...updatePayloadBase,
            phone_e164: normalizedLeadPhone,
            network_type: networkType,
          })
          .eq("id", byPhone.id)
          .select("id")
          .maybeSingle();
        if (retryOnExisting.error) return { ok: false as const, error: retryOnExisting.error.message };
        updated = retryOnExisting.data ?? null;
        leadId = byPhone.id;
      } else {
        return { ok: false as const, error: "Telefone já está vinculado a outro lead." };
      }
    } else {
      return { ok: false as const, error: firstUpdate.error.message };
    }
  } else {
    updated = firstUpdate.data ?? null;
  }

  if (!updated) return { ok: false as const, error: "Não foi possível salvar as informações." };

  revalidatePath("/leads", "page");
  revalidatePath("/leads", "layout");
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

export async function removeLeadFromCategoryGrid(input: { leadId: string }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const leadId = input.leadId.trim();
  if (!leadId) return { ok: false as const, error: "Lead inválido." };

  const crm = crmTables(supabase);
  const { data: updated, error } = await crm
    .from("leads")
    .update({
      client_category: null,
      distributor_id: null,
      network_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível excluir da categoria." };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}
