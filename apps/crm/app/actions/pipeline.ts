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
    distributor_id: row.distributor_id,
    network_type: row.network_type,
    phone_e164: row.phone_e164,
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
    ownerId,
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
  const [cardsResult, allCountsResult, visibleCountsResult, ownerCountsResult, summaryResult, profilesResult] =
    await Promise.all([
      crm.rpc("pipeline_cards_page", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
        p_offset: 0,
        p_limit: PAGE_SIZE,
      }),
      crm.rpc("pipeline_stage_counts", { ...common, p_owner_user_id: null }),
      crm.rpc("pipeline_stage_counts", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
      }),
      crm.rpc("pipeline_owner_counts", common),
      crm.rpc("pipeline_owner_summary", {
        p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
        p_owner_user_id: input.filters.ownerUserId,
        p_region: input.filters.region,
        p_client_category: input.filters.clientCategory,
        p_query: input.filters.query.trim() || null,
        p_stage_id: input.filters.stageId,
        p_volume: input.filters.volume,
      }),
      crm.from("profiles").select("id, full_name"),
    ]);
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
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const [{ data, error }, { data: profiles }] = await Promise.all([
    crm.rpc("pipeline_cards_page", {
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
    }),
    crm.from("profiles").select("id, full_name"),
  ]);
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
