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
import { getWeeklyBreadCount } from "@/lib/lead-signals";
import { logPipelinePerformance, timePipelineOperation } from "@/lib/pipeline-performance";
import { indexFollowUpsByLead, type LeadFollowUpDTO } from "@/lib/follow-ups";
import { isPhoneSearchQuery } from "@/lib/phone-search-query";

const INITIAL_PAGE_SIZE = 10;
const PAGE_SIZE = 20;
type PipelineCardRow = Database["crm"]["Functions"]["pipeline_cards"]["Returns"][number];
type Crm = ReturnType<typeof crmTables>;

async function loadFollowUps(crm: Crm, rows: PipelineCardRow[]) {
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter(Boolean))];
  if (leadIds.length === 0) return new Map<string, LeadFollowUpDTO>();
  const { data, error } = await crm
    .from("tasks")
    .select("id, lead_id, title, due_at, assignee_id")
    .in("lead_id", leadIds)
    .eq("task_kind", "follow_up")
    .eq("done", false)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return indexFollowUpsByLead(data ?? []);
}

function mapRow(
  row: PipelineCardRow,
  ownerNames: Map<string, string>,
  followUps: Map<string, LeadFollowUpDTO>,
): PipelineCardDTO {
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
    phone_e164: row.phone_e164,
    client_category: row.client_category,
    companyCity: row.company_city,
    companyState: row.company_state,
    conversationId: row.conversation_id,
    weeklyBreadCount: getWeeklyBreadCount(row.weekly_bread_consumption),
    lastDirection: row.last_direction,
    lastSentAt: row.last_sent_at,
    opportunityUpdatedAt: row.opportunity_updated_at,
    nextActionAt: row.next_action_at,
    followUp: followUps.get(row.lead_id) ?? null,
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
  if (isPhoneSearchQuery(input.filters.query)) {
    const [cardsTimed, profilesTimed] = await Promise.all([
      timePipelineOperation("cards", crm.rpc("pipeline_cards_page", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
        p_offset: 0,
        p_limit: INITIAL_PAGE_SIZE,
      })),
      timePipelineOperation("profiles", crm.from("profiles").select("id, full_name")),
    ]);
    const cardsResult = cardsTimed.value;
    const profilesResult = profilesTimed.value;
    logPipelinePerformance(
      "filter_snapshot_phone",
      performance.now() - startedAt,
      [cardsTimed, profilesTimed],
      { cards: cardsResult.data?.length ?? 0, hasOwner: Boolean(input.filters.ownerUserId) },
    );
    const error = cardsResult.error ?? profilesResult.error;
    if (error) return { ok: false as const, error: error.message };

    const ownerNames = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.id,
        (profile.full_name ?? "").trim() || "Sem nome",
      ]),
    );
    const cardRows = (cardsResult.data ?? []) as PipelineCardRow[];
    let followUps: Map<string, LeadFollowUpDTO>;
    try {
      followUps = await loadFollowUps(crm, cardRows);
    } catch (followUpError) {
      return {
        ok: false as const,
        error: followUpError instanceof Error ? followUpError.message : "Falha ao carregar follow-ups.",
      };
    }
    const cards = cardRows.map((row) => mapRow(row, ownerNames, followUps));
    const stageCounts = new Map<string, { card_count: number; volume_kg: number }>();
    const ownerCounts = new Map<string, number>();
    for (const row of cardRows) {
      const stage = stageCounts.get(row.stage_id) ?? { card_count: 0, volume_kg: 0 };
      stage.card_count += 1;
      stage.volume_kg += Number(row.weekly_bread_consumption ?? 0);
      stageCounts.set(row.stage_id, stage);
      const ownerId = row.opportunity_owner_id ?? row.lead_owner_id;
      if (ownerId) ownerCounts.set(ownerId, (ownerCounts.get(ownerId) ?? 0) + 1);
    }
    const now = Date.now();
    const summary = cardRows.reduce(
      (current, row) => {
        if (row.stage_is_final) return current;
        current.open_count += 1;
        if (row.last_direction === "in") current.awaiting_reply_count += 1;
        if (new Date(row.opportunity_updated_at).getTime() <= now - 7 * 86_400_000) {
          current.stale_count += 1;
        }
        if (row.next_action_at && new Date(row.next_action_at).getTime() < now) {
          current.overdue_count += 1;
        }
        return current;
      },
      { open_count: 0, awaiting_reply_count: 0, stale_count: 0, overdue_count: 0 },
    );
    const compactStageCounts = [...stageCounts].map(([stage_id, counts]) => ({ stage_id, ...counts }));
    return {
      ok: true as const,
      cards,
      allStageCounts: compactStageCounts,
      visibleStageCounts: compactStageCounts,
      ownerCounts: [...ownerCounts].map(([owner_id, card_count]) => ({ owner_id, card_count })),
      ownerSummary: summary,
    };
  }
  const [cardsTimed, allCountsTimed, visibleCountsTimed, ownerCountsTimed, summaryTimed, profilesTimed] =
    await Promise.all([
      timePipelineOperation("cards", crm.rpc("pipeline_cards_page", {
        ...common,
        p_owner_user_id: input.filters.ownerUserId,
        p_offset: 0,
        p_limit: INITIAL_PAGE_SIZE,
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
  const cardRows = (cardsResult.data ?? []) as PipelineCardRow[];
  let followUps: Map<string, LeadFollowUpDTO>;
  try {
    followUps = await loadFollowUps(crm, cardRows);
  } catch (followUpError) {
    return {
      ok: false as const,
      error: followUpError instanceof Error ? followUpError.message : "Falha ao carregar follow-ups.",
    };
  }
  return {
    ok: true as const,
    cards: cardRows.map((row) => mapRow(row, ownerNames, followUps)),
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
  const cardRows = (data ?? []) as PipelineCardRow[];
  const followUps = await loadFollowUps(crm, cardRows);
  const cards = cardRows.map((row) => mapRow(row, ownerNames, followUps));

  return {
    ok: true as const,
    cards,
  };
}
