"use server";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { distributorOptionLabel, isPlaceholderDistributorName, type DistributorOption } from "@/lib/distributors";
import { evaluateAdvanceAccept, suggestionResolutionStatus } from "@/lib/pipeline-advance";
import { runPipelineAdvanceJob } from "@/lib/pipeline-advance-job";
import { canonicalPipelineStageKey, selectCanonicalPipelineStages } from "@/lib/pipeline-canonical-stages";
import { isPipelineSubstageStageKey, type PipelineSubstageDTO } from "@/lib/pipeline-substages";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { nestOne } from "@/lib/supabase/nested";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { revalidatePath } from "next/cache";

export type PipelineClassificationCatalog = {
  stages: { id: string; name: string; sortOrder: number; isFinal: boolean }[];
  substages: PipelineSubstageDTO[];
  distributors: DistributorOption[];
};

export type PipelineAdvanceSuggestionDTO = {
  id: string;
  leadId: string;
  conversationId: string;
  personName: string;
  companyLine: string | null;
  fromStageName: string;
  fromSubstage: string | null;
  toStageId: string;
  toStageName: string;
  toSubstage: string | null;
  distributorId: string | null;
  distributorName: string | null;
  toClassification: string;
  rationale: string;
  evidenceQuote: string;
  confidence: number;
};

export async function listPendingPipelineAdvanceSuggestions(): Promise<{
  ok: true;
  items: PipelineAdvanceSuggestionDTO[];
  canRunJob: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, items: [], canRunJob: false };
  const crm = crmTables(supabase);
  const { data: profile } = await crm.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canRunJob = profile?.role === "admin" || profile?.role === "gestao";

  const { data, error } = await crm
    .from("pipeline_advance_suggestions")
    .select(
      "id, lead_id, conversation_id, from_stage_id, to_stage_id, from_substage, to_substage, to_classification, rationale, evidence_quote, confidence, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(id, name))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const { data: stages } = await crm.from("pipeline_stages").select("id, name");
  const stageNameById = new Map((stages ?? []).map((stage) => [stage.id, stage.name]));

  const items: PipelineAdvanceSuggestionDTO[] = (data ?? []).map((row) => {
    const lead = nestOne(row.leads);
    const contact = nestOne(lead?.contacts);
    const company = nestOne(lead?.companies);
    const distributor = nestOne(lead?.distributors);
    return {
      id: row.id,
      leadId: row.lead_id,
      conversationId: row.conversation_id,
      personName: displayPersonName(contact?.full_name) || lead?.phone_e164 || "Cliente",
      companyLine: displayCompanyName({
        companyName: company?.name,
        distributorName: distributor?.name,
        clientCategory: lead?.client_category,
      }),
      fromStageName: stageNameById.get(row.from_stage_id) ?? "",
      fromSubstage: row.from_substage,
      toStageId: row.to_stage_id,
      toStageName: stageNameById.get(row.to_stage_id) ?? "",
      toSubstage: row.to_substage,
      distributorId: distributor?.id ?? null,
      distributorName: distributor?.name ?? null,
      toClassification: row.to_classification,
      rationale: row.rationale,
      evidenceQuote: row.evidence_quote,
      confidence: Number(row.confidence),
    };
  });

  return { ok: true, items, canRunJob };
}

export async function countPendingPipelineAdvanceSuggestions(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  const crm = crmTables(supabase);
  const { count, error } = await crm
    .from("pipeline_advance_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export async function resolvePipelineAdvanceSuggestion(input: {
  id: string;
  action: "accept" | "dismiss";
  stageId?: string | null;
  substage?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = input.id.trim();
  if (!id) return { ok: false, error: "Sugestão inválida." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);

  const { data: suggestion, error } = await crm
    .from("pipeline_advance_suggestions")
    .select("id, conversation_id, opportunity_id, to_classification, to_stage_id, to_substage, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!suggestion || suggestion.status !== "pending") {
    return { ok: false, error: "Sugestão não está mais pendente." };
  }

  const nowIso = new Date().toISOString();
  if (input.action === "dismiss") {
    const { error: updateError } = await crm
      .from("pipeline_advance_suggestions")
      .update({
        status: "dismissed",
        resolved_at: nowIso,
        resolved_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", "pending");
    if (updateError) return { ok: false, error: updateError.message };
    await crm
      .from("conversations")
      .update({ pipeline_ai_analyzed: true, updated_at: nowIso })
      .eq("id", suggestion.conversation_id);
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/sugestoes");
    return { ok: true };
  }

  const chosenStageId = (input.stageId ?? "").trim() || suggestion.to_stage_id;
  const chosenSubstage = (input.stageId ?? "").trim()
    ? (input.substage ?? "").trim() || null
    : suggestion.to_substage;
  const resolution = suggestionResolutionStatus({
    suggestedStageId: suggestion.to_stage_id,
    suggestedSubstage: suggestion.to_substage,
    chosenStageId,
    chosenSubstage,
  });

  if (resolution === "accepted") {
    const { data: opportunity } = await crm
      .from("opportunities")
      .select("id, stage_id, lost_reason, pipeline_stages(name)")
      .eq("id", suggestion.opportunity_id)
      .maybeSingle();
    const { data: suggestedStage } = await crm
      .from("pipeline_stages")
      .select("name")
      .eq("id", suggestion.to_stage_id)
      .maybeSingle();
    const currentStage = nestOne(opportunity?.pipeline_stages);
    const decision = evaluateAdvanceAccept({
      currentStageName: currentStage?.name ?? "",
      suggestedStageName: suggestedStage?.name ?? "",
      currentSubstage: opportunity?.lost_reason ?? null,
      suggestedSubstage: suggestion.to_substage,
    });

    if (decision.action === "expire") {
      await crm
        .from("pipeline_advance_suggestions")
        .update({
          status: "expired",
          resolved_at: nowIso,
          resolved_by: user.id,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("status", "pending");
      revalidatePath("/pipeline");
      revalidatePath("/pipeline/sugestoes");
      return { ok: false, error: "O funil já não precisa desta sugestão." };
    }
  }

  const classified = await updateConversationPipelineClassification({
    conversationId: suggestion.conversation_id,
    stageId: chosenStageId,
    substage: chosenSubstage,
  });
  if (!classified.ok) return classified;
  await crm
    .from("conversations")
    .update({ pipeline_ai_analyzed: true, updated_at: nowIso })
    .eq("id", suggestion.conversation_id);

  const { error: acceptError } = await crm
    .from("pipeline_advance_suggestions")
    .update({
      status: resolution,
      resolved_at: nowIso,
      resolved_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (acceptError) return { ok: false, error: acceptError.message };

  revalidatePath("/pipeline");
  revalidatePath("/pipeline/sugestoes");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function loadPipelineClassificationCatalog(): Promise<
  { ok: true; catalog: PipelineClassificationCatalog } | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const [stagesResult, substagesResult, distributorsResult] = await Promise.all([
    crm.from("pipeline_stages").select("id, name, sort_order, is_final").order("sort_order", { ascending: true }),
    crm.from("lost_reasons").select("id, name, stage_key, sort_order, active").order("sort_order", { ascending: true }),
    crm
      .from("distributors")
      .select("id, name, distributor_regions(region_name, state)")
      .eq("active", true)
      .not("name", "ilike", "PENDENTE CARTEIRA · %")
      .order("name", { ascending: true }),
  ]);
  if (stagesResult.error) return { ok: false, error: stagesResult.error.message };
  if (substagesResult.error) return { ok: false, error: substagesResult.error.message };
  if (distributorsResult.error) return { ok: false, error: distributorsResult.error.message };

  const stages = selectCanonicalPipelineStages(stagesResult.data ?? []).map((stage) => ({
    id: stage.id,
    name: stage.name,
    sortOrder: stage.sort_order,
    isFinal: stage.is_final,
  }));
  const substages = (substagesResult.data ?? []).flatMap((row) => {
    if (!isPipelineSubstageStageKey(row.stage_key)) return [];
    return [{
      id: row.id,
      name: row.name,
      stage_key: canonicalPipelineStageKey(row.stage_key) as PipelineSubstageDTO["stage_key"],
      sort_order: row.sort_order,
      active: row.active,
    }];
  });
  const distributors = (distributorsResult.data ?? [])
    .filter((row) => !isPlaceholderDistributorName(row.name))
    .map((row) => {
      const regions = row.distributor_regions as
        | { region_name: string; state: string | null }
        | { region_name: string; state: string | null }[]
        | null;
      const region = Array.isArray(regions) ? regions[0] : regions;
      return {
        id: row.id,
        name: distributorOptionLabel({
          name: row.name,
          city: region?.region_name,
          state: region?.state,
        }),
      };
    });

  return { ok: true, catalog: { stages, substages, distributors } };
}

/** Encerra a sugestão pendente depois que a pessoa classifica no chat, para o Aceitar não sobrescrever. */
export async function settlePendingAdvanceSuggestion(input: {
  conversationId: string;
  stageId: string | null;
  substage: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const conversationId = input.conversationId.trim();
  if (!conversationId) return { ok: false, error: "Conversa inválida." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: suggestion, error } = await crm
    .from("pipeline_advance_suggestions")
    .select("id, to_stage_id, to_substage, status")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!suggestion) return { ok: true };

  const chosenStageId = (input.stageId ?? "").trim();
  const nowIso = new Date().toISOString();
  const status = chosenStageId
    ? suggestionResolutionStatus({
        suggestedStageId: suggestion.to_stage_id,
        suggestedSubstage: suggestion.to_substage,
        chosenStageId,
        chosenSubstage: input.substage,
      })
    : "dismissed";
  const { error: updateError } = await crm
    .from("pipeline_advance_suggestions")
    .update({
      status,
      resolved_at: nowIso,
      resolved_by: user.id,
      updated_at: nowIso,
    })
    .eq("id", suggestion.id)
    .eq("status", "pending");
  if (updateError) return { ok: false, error: updateError.message };
  await crm
    .from("conversations")
    .update({ pipeline_ai_analyzed: true, updated_at: nowIso })
    .eq("id", conversationId);
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/sugestoes");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function runPipelineAdvanceJobNow(): Promise<
  | {
      ok: true;
      scanned: number;
      suggested: number;
      autoApplied: number;
      skipped: number;
      errors: number;
      qualified: number;
    }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: profile } = await crm.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "gestao") {
    return { ok: false, error: "Apenas admin ou gestão pode atualizar as sugestões." };
  }
  try {
    const result = await runPipelineAdvanceJob(40);
    revalidatePath("/pipeline");
    revalidatePath("/pipeline/sugestoes");
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao gerar sugestões." };
  }
}
