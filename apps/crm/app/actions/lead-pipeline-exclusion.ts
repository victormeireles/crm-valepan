"use server";

import {
  isLeadExclusionReason,
  type LeadExclusionReason,
} from "@/lib/lead-pipeline-exclusion";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { ensureLeadCompanyName } from "@/lib/lead-company";
import { revalidatePath } from "next/cache";

const LOST_REASON_EXCLUDED = "Não prospecto (arquivado no inbox)";

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

async function resolveEntryPipelineStageId(
  crm: ReturnType<typeof crmTables>,
): Promise<{ id: string } | null> {
  const { data } = await crm
    .from("pipeline_stages")
    .select("id")
    .eq("is_final", false)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ?? null;
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
      "id, phone_e164, excluded_from_pipeline_at",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) return { ok: false as const, error: leadErr.message };
  if (!lead) return { ok: false as const, error: "Lead não encontrado." };
  if (lead.excluded_from_pipeline_at) {
    return { ok: false as const, error: "Este contato já está arquivado." };
  }

  const actorProfileId = await resolveProfileActorId(crm, user.id);

  if (input.reason === "cliente") {
    const company = await ensureLeadCompanyName(crm, leadId, {
      phoneE164Fallback: lead.phone_e164,
    });
    if (!company.ok) return { ok: false as const, error: company.error };
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
  const entryStage = await resolveEntryPipelineStageId(crm);
  if (!entryStage) {
    return {
      ok: false as const,
      error: "Não foi possível localizar a etapa de entrada para qualificação.",
    };
  }

  // Reabre apenas a oportunidade encerrada por este arquivamento. Assim, uma
  // oportunidade realmente perdida ou convertida não é reativada por engano.
  const { data: archivedOpp, error: archivedOppErr } = await crm
    .from("opportunities")
    .select("id")
    .eq("lead_id", leadId)
    .eq("lost_reason", LOST_REASON_EXCLUDED)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (archivedOppErr) return { ok: false as const, error: archivedOppErr.message };

  const opportunityResult = archivedOpp?.id
    ? await crm
        .from("opportunities")
        .update({
          stage_id: entryStage.id,
          lost_reason: null,
          updated_at: nowIso,
        })
        .eq("id", archivedOpp.id)
    : await crm.from("opportunities").insert({
        lead_id: leadId,
        stage_id: entryStage.id,
        title: lead.phone_e164 ? `WhatsApp ${lead.phone_e164}` : "Oportunidade",
        owner_id: actorProfileId,
      });

  if (opportunityResult.error) {
    return { ok: false as const, error: opportunityResult.error.message };
  }

  // O lead só volta à lista ativa depois que sua oportunidade está pronta na
  // etapa de entrada, evitando que apareça indevidamente em "No funil".
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
