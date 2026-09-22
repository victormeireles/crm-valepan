"use server";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { evaluateAdvanceAccept } from "@/lib/pipeline-advance";
import { runPipelineAdvanceJob } from "@/lib/pipeline-advance-job";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { nestOne } from "@/lib/supabase/nested";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { revalidatePath } from "next/cache";

export type PipelineAdvanceSuggestionDTO = {
  id: string;
  leadId: string;
  conversationId: string;
  personName: string;
  companyLine: string | null;
  fromStageName: string;
  fromSubstage: string | null;
  toStageName: string;
  toSubstage: string | null;
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
      "id, lead_id, conversation_id, from_stage_id, to_stage_id, from_substage, to_substage, to_classification, rationale, evidence_quote, confidence, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
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
      toStageName: stageNameById.get(row.to_stage_id) ?? "",
      toSubstage: row.to_substage,
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

  const classified = await updateConversationPipelineClassification({
    conversationId: suggestion.conversation_id,
    stageId: suggestion.to_stage_id,
    substage: suggestion.to_substage,
  });
  if (!classified.ok) return classified;
  await crm
    .from("conversations")
    .update({ pipeline_ai_analyzed: true, updated_at: nowIso })
    .eq("id", suggestion.conversation_id);

  const { error: acceptError } = await crm
    .from("pipeline_advance_suggestions")
    .update({
      status: "accepted",
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

export async function runPipelineAdvanceJobNow(): Promise<
  | { ok: true; scanned: number; suggested: number; autoApplied: number; skipped: number; errors: number }
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
