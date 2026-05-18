"use server";

import { createAdminSupabaseClient, crmTables as crmAdminTables } from "@/lib/supabase/admin";
import { createServerSupabaseClient, crmTables as crmServerTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isSampleStageName(name: string) {
  const n = normalizeText(name);
  return n.includes("amostra") || n.includes("amostras");
}

export async function updateOpportunityStage(input: {
  opportunityId: string;
  stageId: string;
  lostReason: string | null;
}) {
  const serverSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  const crm = (() => {
    try {
      const admin = createAdminSupabaseClient();
      return crmAdminTables(admin);
    } catch {
      return crmServerTables(serverSupabase);
    }
  })();

  const { data: stage } = await crm
    .from("pipeline_stages")
    .select("id, name, is_final")
    .eq("id", input.stageId)
    .single();

  if (!stage) return { ok: false as const, error: "Etapa inválida" };

  const isLost = stage.name.toLowerCase().includes("perdido");
  if (isLost && (!input.lostReason || !input.lostReason.trim())) {
    return { ok: false as const, error: "Informe o motivo de perda." };
  }

  const { data: oppRow } = await crm
    .from("opportunities")
    .select(
      "lead_id, company_id, title, leads(phone_e164, company_id, contacts(full_name)), companies(name)",
    )
    .eq("id", input.opportunityId)
    .maybeSingle();

  const enteringSampleStage = isSampleStageName(stage.name);
  if (enteringSampleStage && !oppRow?.lead_id) {
    return {
      ok: false as const,
      error: "Esta oportunidade não está vinculada a um lead; não dá para registrar em Amostras.",
    };
  }

  if (enteringSampleStage && oppRow?.lead_id) {
    const { data: existing } = await crm
      .from("sample_shipments")
      .select("id")
      .eq("lead_id", oppRow.lead_id)
      .limit(1)
      .maybeSingle();

    if (!existing?.id) {
      const lead = oppRow.leads as
        | {
            phone_e164: string;
            company_id: string | null;
            contacts: { full_name: string | null } | { full_name: string | null }[] | null;
          }
        | { phone_e164: string; company_id: string | null; contacts: { full_name: string | null } | { full_name: string | null }[] | null }[]
        | null;

      const leadObj = Array.isArray(lead) ? lead[0] ?? null : lead;
      const contactObj = leadObj?.contacts
        ? Array.isArray(leadObj.contacts)
          ? leadObj.contacts[0] ?? null
          : leadObj.contacts
        : null;

      const companyFromOpp = oppRow.companies as
        | { name: string }
        | { name: string }[]
        | null;
      const companyObj = Array.isArray(companyFromOpp)
        ? companyFromOpp[0] ?? null
        : companyFromOpp;

      const contactName =
        (contactObj?.full_name ?? "").trim() ||
        (oppRow.title ?? "").trim() ||
        leadObj?.phone_e164 ||
        null;

      const companyId = oppRow.company_id ?? leadObj?.company_id ?? null;

      const { data: ship, error: shipErr } = await crm
        .from("sample_shipments")
        .insert({
          lead_id: oppRow.lead_id,
          company_id: companyId,
          contact_name: contactName,
          address_line: companyObj?.name ? `Empresa: ${companyObj.name}` : null,
          network: companyObj?.name ?? null,
          bread_type: "Solicitação de amostra (funil)",
          status: "PENDENTE",
        })
        .select("id")
        .single();

      if (shipErr || !ship) {
        return { ok: false as const, error: shipErr?.message ?? "Erro ao criar registro de amostra." };
      }

      const { error: itemErr } = await crm.from("sample_items").insert({
        shipment_id: ship.id,
        description: "Solicitação de amostra (funil)",
        qty: 1,
      });

      if (itemErr) {
        return { ok: false as const, error: itemErr.message };
      }
    }
  }

  const { data: updated, error } = await crm
    .from("opportunities")
    .update({
      stage_id: input.stageId,
      lost_reason: isLost ? input.lostReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.opportunityId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) {
    return {
      ok: false as const,
      error: "Não foi possível atualizar a etapa desta oportunidade.",
    };
  }

  if (oppRow?.lead_id) {
    revalidatePath(`/leads/${oppRow.lead_id}`);
  }

  await crm.from("activity_logs").insert({
    entity_type: "opportunity",
    entity_id: input.opportunityId,
    action: "stage_changed",
    payload: {
      stage_id: input.stageId,
      stage_name: stage.name,
      lost_reason: input.lostReason,
    },
    actor_id: user?.id ?? null,
  });

  revalidatePath("/pipeline");
  revalidatePath("/leads");
  if (enteringSampleStage) {
    revalidatePath("/samples");
    revalidatePath("/dashboard");
  }
  return { ok: true as const };
}

export async function createOpportunityForLead(leadId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmServerTables(supabase);

  const { data: stage } = await crm
    .from("pipeline_stages")
    .select("id")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!stage?.id) {
    return { ok: false as const, error: "Nenhuma etapa de funil configurada." };
  }

  const { data: lead } = await crm
    .from("leads")
    .select("phone_e164")
    .eq("id", leadId)
    .maybeSingle();

  const title = lead?.phone_e164 ? `Oportunidade ${lead.phone_e164}` : "Nova oportunidade";

  const { data: inserted, error } = await crm
    .from("opportunities")
    .insert({
      lead_id: leadId,
      stage_id: stage.id,
      title,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false as const, error: error?.message ?? "Erro ao criar oportunidade." };
  }

  await crm.from("activity_logs").insert({
    entity_type: "opportunity",
    entity_id: inserted.id,
    action: "created",
    actor_id: user.id,
    payload: { lead_id: leadId },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const, opportunityId: inserted.id };
}

export async function updateOpportunityDetails(input: {
  opportunityId: string;
  title: string;
  nextActionAt: string | null;
  contactId: string | null;
  contactName: string;
}) {
  const serverSupabase = await createServerSupabaseClient();
  await serverSupabase.auth.getUser();
  const crm = (() => {
    try {
      const admin = createAdminSupabaseClient();
      return crmAdminTables(admin);
    } catch {
      return crmServerTables(serverSupabase);
    }
  })();
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Título obrigatório." };
  const contactName = input.contactName.trim();

  const { data: opp } = await crm
    .from("opportunities")
    .select("lead_id")
    .eq("id", input.opportunityId)
    .maybeSingle();

  const { data: updated, error } = await crm
    .from("opportunities")
    .update({
      title,
      next_action_at: input.nextActionAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.opportunityId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) {
    return {
      ok: false as const,
      error: "Não foi possível salvar os dados desta oportunidade.",
    };
  }

  if (input.contactId) {
    const { data: updatedContact, error: contactError } = await crm
      .from("contacts")
      .update({
        full_name: contactName || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contactId)
      .select("id")
      .maybeSingle();

    if (contactError) return { ok: false as const, error: contactError.message };
    if (!updatedContact) {
      return {
        ok: false as const,
        error: "Não foi possível salvar o nome do contato.",
      };
    }
  }

  if (opp?.lead_id) {
    revalidatePath(`/leads/${opp.lead_id}`);
  }
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  return { ok: true as const };
}
