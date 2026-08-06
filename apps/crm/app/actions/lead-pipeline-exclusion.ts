"use server";

import {
  isLeadExclusionReason,
  type LeadExclusionReason,
} from "@/lib/lead-pipeline-exclusion";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { nestOne } from "@/lib/supabase/nested";
import { revalidatePath } from "next/cache";

const LOST_REASON_EXCLUDED = "Não prospecto (arquivado no inbox)";
const DISTRIBUTOR_NAME_MAX_LEN = 80;
const PENDING_DISTRIBUTOR_PREFIX = "PENDENTE CARTEIRA · ";

function portfolioDistributorName(input: {
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
}) {
  const companyName = (input.companyName ?? "").trim().toUpperCase();
  if (companyName) return companyName.slice(0, DISTRIBUTOR_NAME_MAX_LEN);

  const contactName = (input.contactName ?? "").trim().toUpperCase();
  const fallback = contactName || (input.phone ?? "").trim() || "SEM IDENTIFICAÇÃO";
  return `${PENDING_DISTRIBUTOR_PREFIX}${fallback}`.slice(0, DISTRIBUTOR_NAME_MAX_LEN);
}

async function ensureClientInDistributorPortfolio(
  crm: ReturnType<typeof crmTables>,
  lead: {
    id: string;
    phone_e164: string | null;
    distributor_id: string | null;
    contacts?: { full_name: string | null } | { full_name: string | null }[] | null;
    companies?: { name: string | null } | { name: string | null }[] | null;
  },
): Promise<{ ok: true; distributorId: string } | { ok: false; error: string }> {
  if (lead.distributor_id) return { ok: true, distributorId: lead.distributor_id };

  const name = portfolioDistributorName({
    companyName: nestOne(lead.companies)?.name,
    contactName: nestOne(lead.contacts)?.full_name,
    phone: lead.phone_e164,
  });

  const { data: existing, error: existingErr } = await crm
    .from("distributors")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };

  if (existing?.id) return { ok: true, distributorId: existing.id };

  const { data: inserted, error: insertErr } = await crm
    .from("distributors")
    .insert({
      name,
      active: true,
      notes:
        "Cadastro enviado automaticamente pelo Chat ao arquivar como Cliente. Revise a rede e complete os dados pendentes na Carteira de Distribuidores.",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: insertErr?.message ?? "Não foi possível criar o cadastro na carteira.",
    };
  }
  return { ok: true, distributorId: inserted.id };
}

/** Colunas que referenciam `crm.profiles` (não `auth.users`). */
async function resolveProfileActorId(
  crm: ReturnType<typeof crmTables>,
  authUserId: string,
): Promise<string | null> {
  const { data: prof } = await crm
    .from("profiles")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();
  return prof?.id ?? null;
}

function publicDbError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("leads_excluded_by_fkey") || m.includes("violates foreign key")) {
    return "Não foi possível salvar o arquivamento. Atualize a página e tente de novo.";
  }
  return message;
}

async function resolveSemInteresseStageId(
  crm: ReturnType<typeof crmTables>,
): Promise<string | null> {
  const { data } = await crm
    .from("pipeline_stages")
    .select("id, name, is_final")
    .order("sort_order", { ascending: true });

  const row =
    (data ?? []).find((s) => s.name.trim().toUpperCase() === "SEM INTERESSE") ??
    (data ?? []).find((s) => s.name.toLowerCase().includes("sem interesse")) ??
    (data ?? []).find((s) => s.is_final && s.name.toLowerCase().includes("perdido"));
  return row?.id ?? null;
}

export async function excludeLeadFromPipeline(input: {
  leadId: string;
  reason: LeadExclusionReason;
}) {
  const leadId = input.leadId.trim();
  if (!leadId) return { ok: false as const, error: "Lead inválido." };
  if (!isLeadExclusionReason(input.reason)) {
    return { ok: false as const, error: "Motivo inválido." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  const nowIso = new Date().toISOString();

  const { data: lead, error: leadErr } = await crm
    .from("leads")
    .select(
      "id, phone_e164, distributor_id, excluded_from_pipeline_at, contacts(full_name), companies(name)",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) return { ok: false as const, error: leadErr.message };
  if (!lead) return { ok: false as const, error: "Lead não encontrado." };
  if (lead.excluded_from_pipeline_at) {
    return { ok: false as const, error: "Este contato já está arquivado." };
  }

  const actorProfileId = await resolveProfileActorId(crm, user.id);
  let distributorId = lead.distributor_id;

  if (input.reason === "cliente") {
    const portfolio = await ensureClientInDistributorPortfolio(crm, lead);
    if (!portfolio.ok) return { ok: false as const, error: portfolio.error };
    distributorId = portfolio.distributorId;
  }

  const { error: updateLeadErr } = await crm
    .from("leads")
    .update({
      excluded_from_pipeline_at: nowIso,
      excluded_reason: input.reason,
      excluded_by: actorProfileId,
      ...(input.reason === "cliente"
        ? {
            status: "cliente",
            client_category: "distribuidor",
            distributor_id: distributorId,
          }
        : {}),
      updated_at: nowIso,
    })
    .eq("id", leadId);

  if (updateLeadErr) return { ok: false as const, error: publicDbError(updateLeadErr.message) };

  const semInteresseId = await resolveSemInteresseStageId(crm);
  const { data: finalStages } = await crm
    .from("pipeline_stages")
    .select("id")
    .eq("is_final", true);
  const finalStageIds = new Set((finalStages ?? []).map((s) => s.id));

  const { data: opps } = await crm
    .from("opportunities")
    .select("id, stage_id")
    .eq("lead_id", leadId);

  for (const opp of opps ?? []) {
    if (finalStageIds.has(opp.stage_id)) continue;

    const patch: {
      stage_id?: string;
      lost_reason: string;
      updated_at: string;
    } = {
      lost_reason: LOST_REASON_EXCLUDED,
      updated_at: nowIso,
    };
    if (semInteresseId) patch.stage_id = semInteresseId;

    await crm.from("opportunities").update(patch).eq("id", opp.id);
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: leadId,
    action: "excluded_from_pipeline",
    actor_id: actorProfileId,
    payload: { reason: input.reason },
  });

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/distributors");
  revalidatePath(`/leads/${leadId}`);
  return {
    ok: true as const,
    movedToDistributorPortfolio: input.reason === "cliente",
  };
}

export async function restoreLeadToPipeline(input: { leadId: string }) {
  const leadId = input.leadId.trim();
  if (!leadId) return { ok: false as const, error: "Lead inválido." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  const nowIso = new Date().toISOString();

  const { data: lead, error: leadErr } = await crm
    .from("leads")
    .select("id, excluded_from_pipeline_at, phone_e164")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) return { ok: false as const, error: leadErr.message };
  if (!lead) return { ok: false as const, error: "Lead não encontrado." };
  if (!lead.excluded_from_pipeline_at) {
    return { ok: false as const, error: "Este contato já está ativo no funil." };
  }

  const actorProfileId = await resolveProfileActorId(crm, user.id);

  const { error: updateLeadErr } = await crm
    .from("leads")
    .update({
      excluded_from_pipeline_at: null,
      excluded_reason: null,
      excluded_by: null,
      updated_at: nowIso,
    })
    .eq("id", leadId);

  if (updateLeadErr) return { ok: false as const, error: publicDbError(updateLeadErr.message) };

  const { data: existingOpp } = await crm
    .from("opportunities")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1)
    .maybeSingle();

  if (!existingOpp?.id) {
    const { data: firstStage } = await crm
      .from("pipeline_stages")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true });

    const qualificacao =
      (firstStage ?? []).find((s) => s.name.trim().toUpperCase() === "QUALIFICAÇÃO") ??
      (firstStage ?? [])[0];

    if (qualificacao?.id) {
      await crm.from("opportunities").insert({
        lead_id: leadId,
        stage_id: qualificacao.id,
        title: lead.phone_e164 ? `WhatsApp ${lead.phone_e164}` : "Oportunidade",
        owner_id: actorProfileId,
      });
    }
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: leadId,
    action: "restored_to_pipeline",
    actor_id: actorProfileId,
    payload: {},
  });

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}
