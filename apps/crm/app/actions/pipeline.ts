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

const INITIAL_PAGE_SIZE = 10;
const PAGE_SIZE = 20;
type PipelineCardRow = Database["crm"]["Functions"]["pipeline_cards"]["Returns"][number];
type PipelineStageCountRow = { stage_id: string; card_count: number; volume_kg: number };
type PipelineOwnerCountRow = { owner_id: string; card_count: number };
type PipelineSummaryRow = {
  open_count: number;
  awaiting_reply_count: number;
  stale_count: number;
  overdue_count: number;
};
type PipelineBoardSnapshot = {
  cards: PipelineCardRow[];
  visibleStageCounts: PipelineStageCountRow[];
  allStageCounts: PipelineStageCountRow[];
  ownerCounts: PipelineOwnerCountRow[];
  ownerSummary: PipelineSummaryRow | null;
};
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
  lostReason: string | null;
};

export type PipelineVolumeFilter = "informado" | "ate_100" | "acima_100" | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readBoardSnapshot(value: unknown): PipelineBoardSnapshot | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.cards) || !Array.isArray(row.visible_stage_counts)
    || !Array.isArray(row.all_stage_counts) || !Array.isArray(row.owner_counts)) {
    return null;
  }
  const summary = asRecord(row.summary);
  return {
    cards: row.cards as PipelineCardRow[],
    visibleStageCounts: row.visible_stage_counts as PipelineStageCountRow[],
    allStageCounts: row.all_stage_counts as PipelineStageCountRow[],
    ownerCounts: row.owner_counts as PipelineOwnerCountRow[],
    ownerSummary: summary ? {
      open_count: Number(summary.open_count ?? 0),
      awaiting_reply_count: Number(summary.awaiting_reply_count ?? 0),
      stale_count: Number(summary.stale_count ?? 0),
      overdue_count: Number(summary.overdue_count ?? 0),
    } : null,
  };
}

async function loadBoardSnapshot(
  crm: Crm,
  filters: PipelinePageFilters,
  limit = INITIAL_PAGE_SIZE,
): Promise<{ ok: true; snapshot: PipelineBoardSnapshot } | { ok: false; error: string }> {
  const { data, error } = await crm.rpc("pipeline_board_snapshot", {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_owner_user_id: filters.ownerUserId,
    p_signal: filters.signal,
    p_region: filters.region,
    p_client_category: filters.clientCategory,
    p_query: filters.query.trim() || null,
    p_stage_id: filters.stageId,
    p_offset: 0,
    p_limit: limit,
    p_volume: filters.volume,
    p_lost_reason: filters.lostReason,
  });
  if (error) return { ok: false, error: error.message };
  const snapshot = readBoardSnapshot(data);
  if (!snapshot) return { ok: false, error: "Snapshot do funil inválido." };
  return { ok: true, snapshot };
}

export async function loadPipelineFilterSnapshot(input: { filters: PipelinePageFilters }) {
  const startedAt = performance.now();
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const [snapshotTimed, profilesTimed] = await Promise.all([
    timePipelineOperation("board_snapshot", loadBoardSnapshot(crm, input.filters)),
    timePipelineOperation("profiles", crm.from("profiles").select("id, full_name")),
  ]);
  const snapshotResult = snapshotTimed.value;
  const profilesResult = profilesTimed.value;
  logPipelinePerformance(
    "filter_snapshot",
    performance.now() - startedAt,
    [snapshotTimed, profilesTimed],
    {
      cards: snapshotResult.ok ? snapshotResult.snapshot.cards.length : 0,
      hasOwner: Boolean(input.filters.ownerUserId),
      hasQuery: Boolean(input.filters.query.trim()),
      stageFiltered: Boolean(input.filters.stageId),
    },
  );
  if (!snapshotResult.ok) return snapshotResult;
  if (profilesResult.error) return { ok: false as const, error: profilesResult.error.message };

  const ownerNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      (profile.full_name ?? "").trim() || "Sem nome",
    ]),
  );
  let followUps: Map<string, LeadFollowUpDTO>;
  try {
    followUps = await loadFollowUps(crm, snapshotResult.snapshot.cards);
  } catch (followUpError) {
    return {
      ok: false as const,
      error: followUpError instanceof Error ? followUpError.message : "Falha ao carregar follow-ups.",
    };
  }
  return {
    ok: true as const,
    cards: snapshotResult.snapshot.cards.map((row) => mapRow(row, ownerNames, followUps)),
    allStageCounts: snapshotResult.snapshot.allStageCounts,
    visibleStageCounts: snapshotResult.snapshot.visibleStageCounts,
    ownerCounts: snapshotResult.snapshot.ownerCounts,
    ownerSummary: snapshotResult.snapshot.ownerSummary,
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
      p_lost_reason: input.filters.lostReason,
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
