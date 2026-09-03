"use server";

import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { INBOX_MESSAGES_VISIBLE_SINCE } from "@/lib/inbox/load-messages";
import {
  computePipelineSignals,
  type PipelineRegion,
  type PipelineSignal,
} from "@/lib/pipeline-signals";
import type { ClientCategoryValue } from "@/lib/client-categories";
import type { Database } from "@/lib/database.types";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import type { PipelineCardDTO } from "@/app/(dashboard)/pipeline/pipeline-board";
import { getWeeklyVolumeKg } from "@/lib/lead-signals";
import { logPipelinePerformance, timePipelineOperation } from "@/lib/pipeline-performance";

const PAGE_SIZE = 20;
type PipelineCardRow = Database["crm"]["Functions"]["pipeline_cards"]["Returns"][number];

function mapRow(row: PipelineCardRow, ownerNames: Map<string, string>): PipelineCardDTO {
  const ownerId = row.opportunity_owner_id ?? row.lead_owner_id;
  return {
    id: row.opportunity_id,
    stage_id: row.stage_id,
    title: row.title,
    lost_reason: row.lost_reason,
    lead_id: row.lead_id,
    personName: displayPersonName(row.contact_name),
    companyLine: displayCompanyName({
      companyName: row.company_name,
      distributorName: row.distributor_name,
      clientCategory: row.client_category,
    }),
    client_category: row.client_category,
    companyCity: row.company_city,
    companyState: row.company_state,
    conversationId: row.conversation_id,
    weeklyVolumeKg: getWeeklyVolumeKg(
      row.weekly_bread_consumption,
      row.bread_weight_grams,
    ),
    lastDirection: row.last_direction,
    lastSentAt: row.last_sent_at,
    opportunityUpdatedAt: row.opportunity_updated_at,
    nextActionAt: row.next_action_at,
    ownerName: ownerId ? (ownerNames.get(ownerId) ?? "Responsável desconhecido") : null,
    signals: computePipelineSignals({
      oppUpdatedAt: row.opportunity_updated_at,
      nextActionAt: row.next_action_at,
      isFinalStage: row.stage_is_final,
      lastMessageDirection: row.last_direction,
    }),
  };
}

export type PipelinePageFilters = {
  ownerUserId: string | null;
  signal: PipelineSignal | null;
  region: PipelineRegion | null;
  clientCategory: ClientCategoryValue | null;
  query: string;
  stageId: string | null;
  volume: PipelineVolumeFilter;
};

export type PipelineVolumeFilter = "informado" | "ate_100" | "acima_100" | null;

export async function loadPipelineFilterSnapshot(input: { filters: PipelinePageFilters }) {
  const startedAt = performance.now();
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const common = {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_signal: input.filters.signal,
    p_region: input.filters.region,
    p_client_category: input.filters.clientCategory,
    p_query: input.filters.query.trim() || null,
    p_stage_id: input.filters.stageId,
    p_volume: input.filters.volume,
  };
  const [cardsTimed, allCountsTimed, visibleCountsTimed, ownerCountsTimed, summaryTimed, profilesTimed] =
    await Promise.all([
      timePipelineOperation("cards", crm.rpc("pipeline_cards_page", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
        p_offset: 0,
        p_limit: PAGE_SIZE,
      })),
      timePipelineOperation("all_stage_counts", crm.rpc("pipeline_stage_counts", { ...common, p_owner_user_id: null })),
      timePipelineOperation("visible_stage_counts", crm.rpc("pipeline_stage_counts", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
      })),
      timePipelineOperation("owner_counts", crm.rpc("pipeline_owner_counts", common)),
      timePipelineOperation("owner_summary", crm.rpc("pipeline_owner_summary", {
        p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
        p_owner_user_id: input.filters.ownerUserId,
        p_region: input.filters.region,
        p_client_category: input.filters.clientCategory,
        p_query: input.filters.query.trim() || null,
        p_stage_id: input.filters.stageId,
        p_volume: input.filters.volume,
      })),
      timePipelineOperation("profiles", crm.from("profiles").select("id, full_name")),
    ]);
  const cardsResult = cardsTimed.value;
  const allCountsResult = allCountsTimed.value;
  const visibleCountsResult = visibleCountsTimed.value;
  const ownerCountsResult = ownerCountsTimed.value;
  const summaryResult = summaryTimed.value;
  const profilesResult = profilesTimed.value;
  const timedResults = [cardsTimed, allCountsTimed, visibleCountsTimed, ownerCountsTimed, summaryTimed, profilesTimed];
  logPipelinePerformance(
    "filter_snapshot",
    performance.now() - startedAt,
    timedResults,
    {
      cards: cardsResult.data?.length ?? 0,
      hasOwner: Boolean(input.filters.ownerUserId),
      hasQuery: Boolean(input.filters.query.trim()),
      stageFiltered: Boolean(input.filters.stageId),
    },
  );
  const error = cardsResult.error ?? allCountsResult.error ?? visibleCountsResult.error ??
    ownerCountsResult.error ?? summaryResult.error ?? profilesResult.error;
  if (error) return { ok: false as const, error: error.message };
  const ownerNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      (profile.full_name ?? "").trim() || "Sem nome",
    ]),
  );
  return {
    ok: true as const,
    cards: ((cardsResult.data ?? []) as PipelineCardRow[]).map((row) => mapRow(row, ownerNames)),
    allStageCounts: allCountsResult.data ?? [],
    visibleStageCounts: visibleCountsResult.data ?? [],
    ownerCounts: ownerCountsResult.data ?? [],
    ownerSummary: summaryResult.data?.[0] ?? null,
  };
}

export async function loadPipelineStagePage(input: {
  stageId: string;
  offset: number;
  filters: PipelinePageFilters;
}) {
  const startedAt = performance.now();
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const [cardsTimed, profilesTimed] = await Promise.all([
    timePipelineOperation("cards", crm.rpc("pipeline_cards_page", {
      p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
      p_owner_user_id: input.filters.ownerUserId,
      p_signal: input.filters.signal,
      p_region: input.filters.region,
      p_client_category: input.filters.clientCategory,
      p_query: input.filters.query.trim() || null,
      p_stage_id: input.stageId,
      p_offset: Math.max(0, Math.trunc(input.offset)),
      p_limit: PAGE_SIZE,
      p_volume: input.filters.volume,
    })),
    timePipelineOperation("profiles", crm.from("profiles").select("id, full_name")),
  ]);
  const { data, error } = cardsTimed.value;
  const { data: profiles } = profilesTimed.value;
  const timedResults = [cardsTimed, profilesTimed];
  logPipelinePerformance("stage_page", performance.now() - startedAt, timedResults, {
    stageId: input.stageId,
    offset: input.offset,
    cards: data?.length ?? 0,
  });
  if (error) return { ok: false as const, error: error.message };

  const ownerNames = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      (profile.full_name ?? "").trim() || "Sem nome",
    ]),
  );
  const cards = ((data ?? []) as PipelineCardRow[]).map((row) => mapRow(row, ownerNames));

  return {
    ok: true as const,
    cards,
  };
}
