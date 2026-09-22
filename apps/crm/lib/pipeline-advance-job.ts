import {
  PIPELINE_ADVANCE_BATCH_SIZE,
  PIPELINE_ADVANCE_MESSAGE_LIMIT,
  PIPELINE_ADVANCE_MODEL_CHUNK,
  automaticPipelineRule,
  botFormQualificationRule,
  chunkItems,
  conversationAdvanceFingerprint,
  conversationReplyState,
  formatConversationTranscriptForModel,
  isOpenAdvanceStage,
  selectAdvanceCandidates,
  suggestionFromModelOutput,
  type PipelineSubstageCatalogItem,
  type TranscriptMessage,
} from "@/lib/pipeline-advance";
import { canonicalPipelineStageKey } from "@/lib/pipeline-canonical-stages";
import { classifyConversationsAdvanceBatch, pipelineAdvanceModel } from "@/lib/pipeline-advance-openai";
import { createAdminSupabaseClient, crmTables } from "@/lib/supabase/admin";

export type PipelineAdvanceJobResult = {
  ok: true;
  scanned: number;
  suggested: number;
  autoApplied: number;
  skipped: number;
  errors: number;
};

type OpportunityRow = {
  id: string;
  lead_id: string | null;
  stage_id: string;
  lost_reason: string | null;
  pipeline_stages: { name: string } | { name: string }[] | null;
  leads: { excluded_from_pipeline_at: string | null } | { excluded_from_pipeline_at: string | null }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function markConversationsAnalyzed(
  crm: ReturnType<typeof crmTables>,
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const { error } = await crm
    .from("conversations")
    .update({ pipeline_ai_analyzed: true, updated_at: new Date().toISOString() })
    .in("id", unique);
  if (error) throw new Error(error.message);
}

export async function runPipelineAdvanceJob(
  limit = PIPELINE_ADVANCE_BATCH_SIZE,
): Promise<PipelineAdvanceJobResult> {
  const crm = crmTables(createAdminSupabaseClient());
  const model = pipelineAdvanceModel();
  const nowIso = new Date().toISOString();

  const { data: stageRows, error: stageError } = await crm.from("pipeline_stages").select("id, name");
  if (stageError) throw new Error(stageError.message);
  const stageIdByName = new Map<string, string>();
  for (const stage of stageRows ?? []) {
    stageIdByName.set(canonicalPipelineStageKey(stage.name), stage.id);
  }

  const { data: catalogRows, error: catalogError } = await crm
    .from("lost_reasons")
    .select("name, stage_key, active");
  if (catalogError) throw new Error(catalogError.message);
  const catalog: PipelineSubstageCatalogItem[] = (catalogRows ?? []).map((row) => ({
    name: row.name,
    stage_key: row.stage_key,
    active: row.active,
  }));

  const { data: opportunityRows, error: opportunityError } = await crm
    .from("opportunities")
    .select("id, lead_id, stage_id, lost_reason, pipeline_stages(name), leads(excluded_from_pipeline_at)");
  if (opportunityError) throw new Error(opportunityError.message);

  const opportunities = ((opportunityRows ?? []) as OpportunityRow[])
    .map((row) => {
      const stage = one(row.pipeline_stages);
      const lead = one(row.leads);
      if (!row.lead_id || !stage?.name) return null;
      return {
        id: row.id,
        leadId: row.lead_id,
        stageName: stage.name,
        lostReason: row.lost_reason,
        excluded: Boolean(lead?.excluded_from_pipeline_at),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const opportunityByLead = new Map(opportunities.map((row) => [row.leadId, row]));
  const openLeadIdSet = new Set(
    opportunities
      .filter((row) => !row.excluded && isOpenAdvanceStage(row.stageName))
      .map((row) => row.leadId),
  );

  if (openLeadIdSet.size === 0) {
    return { ok: true, scanned: 0, suggested: 0, autoApplied: 0, skipped: 0, errors: 0 };
  }

  const poolLimit = Math.max(limit * 5, 100);
  const { data: conversationRows, error: conversationError } = await crm
    .from("conversations")
    .select("id, lead_id, conversation_kind, classification, last_message_at, pipeline_ai_analyzed")
    .eq("conversation_kind", "lead")
    .eq("pipeline_ai_analyzed", false)
    .order("last_message_at", { ascending: false })
    .limit(poolLimit);
  if (conversationError) throw new Error(conversationError.message);

  const pool = (conversationRows ?? []).flatMap((row) =>
    row.lead_id && openLeadIdSet.has(row.lead_id)
      ? [{
          id: row.id,
          leadId: row.lead_id,
          kind: row.conversation_kind,
          classification: row.classification,
          lastMessageAt: row.last_message_at,
          pipelineAiAnalyzed: Boolean(row.pipeline_ai_analyzed),
        }]
      : [],
  );

  const staleIds = (conversationRows ?? [])
    .filter((row) => !row.lead_id || !openLeadIdSet.has(row.lead_id))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await markConversationsAnalyzed(crm, staleIds);
  }

  if (pool.length === 0) {
    return { ok: true, scanned: 0, suggested: 0, autoApplied: 0, skipped: staleIds.length, errors: 0 };
  }

  const conversationIds = pool.map((row) => row.id);
  const { data: existingRows, error: existingError } = await crm
    .from("pipeline_advance_suggestions")
    .select("conversation_id, status, fingerprint")
    .in("conversation_id", conversationIds)
    .in("status", ["pending", "dismissed", "accepted"]);
  if (existingError) throw new Error(existingError.message);

  const recent = await crm.rpc("pipeline_advance_recent_messages", {
    p_conversation_ids: conversationIds,
    p_limit: PIPELINE_ADVANCE_MESSAGE_LIMIT,
  });
  if (recent.error) throw new Error(recent.error.message);

  const messagesByConversation = new Map<string, TranscriptMessage[]>();
  for (const message of recent.data ?? []) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push({
      id: message.id,
      direction: message.direction,
      body: message.body,
      media_kind: message.media_kind,
      event_kind: message.event_kind,
      sent_at: message.sent_at,
    });
    messagesByConversation.set(message.conversation_id, list);
  }

  let autoApplied = 0;
  let skipped = staleIds.length;
  let errors = 0;
  const skipAi = new Set<string>();
  const markAnalyzedIds: string[] = [];

  for (const conversation of pool) {
    const opportunity = opportunityByLead.get(conversation.leadId);
    const messages = messagesByConversation.get(conversation.id) ?? [];
    const replyState = conversationReplyState(messages);
    const rule =
      automaticPipelineRule({
        replyState,
        currentStageName: opportunity?.stageName ?? "LEADS",
        currentSubstage: opportunity?.lostReason ?? null,
      }) ??
      (replyState === "customer_replied"
        ? botFormQualificationRule({
            currentStageName: opportunity?.stageName ?? "LEADS",
            currentSubstage: opportunity?.lostReason ?? null,
            messages,
          })
        : null);
    if (!rule) continue;
    skipAi.add(conversation.id);
    try {
      if (rule.kind === "apply") {
        const { error } = await crm
          .from("conversations")
          .update({
            classification: rule.toClassification,
            pipeline_ai_analyzed: true,
            updated_at: nowIso,
          })
          .eq("id", conversation.id);
        if (error) throw new Error(error.message);
        autoApplied += 1;
      } else {
        markAnalyzedIds.push(conversation.id);
        skipped += 1;
      }
    } catch (error) {
      console.error("[pipeline-advance] auto rule failed", conversation.id, error);
      errors += 1;
    }
  }

  const fingerprints: Record<string, string> = {};
  const conversationsForAi = pool.flatMap((conversation) => {
    if (skipAi.has(conversation.id)) return [];
    const opportunity = opportunityByLead.get(conversation.leadId);
    const messages = messagesByConversation.get(conversation.id) ?? [];
    const replyState = conversationReplyState(messages);
    const substage = opportunity?.lostReason ?? null;
    fingerprints[conversation.id] = conversationAdvanceFingerprint({
      conversationId: conversation.id,
      stageName: opportunity?.stageName ?? "LEADS",
      substage,
      messageIds: messages.map((message) => message.id),
    });
    return [{
      id: conversation.id,
      leadId: conversation.leadId,
      kind: conversation.kind,
      classification: conversation.classification,
      substage,
      lastMessageAt: conversation.lastMessageAt,
      pipelineAiAnalyzed: false,
      replyState,
    }];
  });

  const candidates = selectAdvanceCandidates({
    opportunities,
    conversations: conversationsForAi,
    fingerprints,
    existing: (existingRows ?? []).map((row) => ({
      conversationId: row.conversation_id,
      status: row.status,
      fingerprint: row.fingerprint,
    })),
    limit,
  });

  console.log(`[pipeline-advance] ${candidates.length} AI candidates · ${autoApplied} auto`);

  let suggested = 0;
  const pendingByConversation = new Map(
    (existingRows ?? [])
      .filter((row) => row.status === "pending")
      .map((row) => [row.conversation_id, row]),
  );

  const ready = candidates.flatMap((candidate) => {
    const messages = messagesByConversation.get(candidate.conversationId) ?? [];
    const transcript = formatConversationTranscriptForModel(messages);
    if (!transcript.trim()) {
      skipped += 1;
      markAnalyzedIds.push(candidate.conversationId);
      return [];
    }
    return [{ candidate, transcript }];
  });

  for (const group of chunkItems(ready, PIPELINE_ADVANCE_MODEL_CHUNK)) {
    try {
      const outputs = await classifyConversationsAdvanceBatch({
        catalog,
        items: group.map(({ candidate, transcript }) => ({
          id: candidate.conversationId,
          currentStageName: candidate.stageName,
          currentSubstage: candidate.substage,
          transcript,
        })),
      });
      for (const { candidate } of group) {
        const output = outputs.get(candidate.conversationId) ?? null;
        const parsed = output
          ? suggestionFromModelOutput({
              currentStageName: candidate.stageName,
              currentSubstage: candidate.substage,
              catalog,
              output,
            })
          : null;
        markAnalyzedIds.push(candidate.conversationId);
        if (!parsed) {
          skipped += 1;
          continue;
        }
        const fromStageId = stageIdByName.get(candidate.stageName);
        const toStageId = stageIdByName.get(parsed.toStageName);
        if (!fromStageId || !toStageId) {
          skipped += 1;
          continue;
        }
        const payload = {
          lead_id: candidate.leadId,
          conversation_id: candidate.conversationId,
          opportunity_id: candidate.opportunityId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          from_classification: candidate.classification,
          to_classification: parsed.toClassification,
          from_substage: candidate.substage,
          to_substage: parsed.toSubstage,
          confidence: parsed.confidence,
          rationale: parsed.rationale,
          evidence_quote: parsed.evidenceQuote,
          status: "pending" as const,
          fingerprint: candidate.fingerprint,
          model,
          updated_at: nowIso,
        };
        const pending = pendingByConversation.get(candidate.conversationId);
        if (pending) {
          const { error } = await crm
            .from("pipeline_advance_suggestions")
            .update(payload)
            .eq("conversation_id", candidate.conversationId)
            .eq("status", "pending");
          if (error) throw new Error(error.message);
        } else {
          const { error } = await crm.from("pipeline_advance_suggestions").insert(payload);
          if (error) throw new Error(error.message);
        }
        suggested += 1;
      }
    } catch (error) {
      console.error(
        "[pipeline-advance] batch failed",
        group.map(({ candidate }) => candidate.conversationId),
        error,
      );
      errors += group.length;
    }
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.conversationId));
  const existingByConversation = new Map(
    (existingRows ?? []).map((row) => [row.conversation_id, row] as const),
  );
  for (const row of conversationsForAi) {
    if (candidateIds.has(row.id)) continue;
    if (row.replyState !== "customer_replied") {
      markAnalyzedIds.push(row.id);
      continue;
    }
    const existing = existingByConversation.get(row.id);
    const fingerprint = fingerprints[row.id];
    if (
      existing &&
      fingerprint &&
      existing.fingerprint === fingerprint &&
      (existing.status === "pending" || existing.status === "dismissed" || existing.status === "accepted")
    ) {
      markAnalyzedIds.push(row.id);
    }
  }
  await markConversationsAnalyzed(crm, markAnalyzedIds);

  console.log(
    `[pipeline-advance] done scanned=${candidates.length} suggested=${suggested} auto=${autoApplied} skipped=${skipped} errors=${errors}`,
  );
  return {
    ok: true,
    scanned: candidates.length + autoApplied,
    suggested,
    autoApplied,
    skipped,
    errors,
  };
}

export async function runPipelineAdvanceBackfill(
  maxRounds = 20,
  limit = 80,
): Promise<PipelineAdvanceJobResult[]> {
  const rounds: PipelineAdvanceJobResult[] = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const result = await runPipelineAdvanceJob(limit);
    rounds.push(result);
    console.log(
      `[pipeline-advance] backfill round ${round + 1}/${maxRounds} scanned=${result.scanned} suggested=${result.suggested} auto=${result.autoApplied} skipped=${result.skipped} errors=${result.errors}`,
    );
    if (result.scanned === 0) break;
  }
  return rounds;
}
