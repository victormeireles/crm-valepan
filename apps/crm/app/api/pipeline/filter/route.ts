import { NextRequest, NextResponse } from "next/server";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { getWeeklyBreadCount } from "@/lib/lead-signals";
import { computePipelineSignals, isPipelineRegion, isPipelineSignal } from "@/lib/pipeline-signals";
import { isClientCategoryValue } from "@/lib/client-categories";
import { INBOX_MESSAGES_VISIBLE_SINCE } from "@/lib/inbox/load-messages";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { indexFollowUpsByLead, type LeadFollowUpDTO } from "@/lib/follow-ups";
import type { Database } from "@/lib/database.types";
import type { PipelineCardDTO } from "@/app/(dashboard)/pipeline/pipeline-board";

type PipelineCardRow = Database["crm"]["Functions"]["pipeline_cards"]["Returns"][number];
type FilterPart = "cards" | "counts" | "kpis";

function text(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableUuid(value: unknown) {
  const candidate = text(value, 40);
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate) ? candidate : null;
}

function normalizeFilters(value: unknown) {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const signal = text(row.signal, 40);
  const region = text(row.region, 10);
  const category = text(row.clientCategory, 40);
  const volume = text(row.volume, 20);
  const lostReason = text(row.lostReason, 80);
  return {
    ownerUserId: nullableUuid(row.ownerUserId),
    signal: isPipelineSignal(signal) ? signal : null,
    region: isPipelineRegion(region) ? region : null,
    clientCategory: isClientCategoryValue(category) ? category : null,
    query: text(row.query, 200) || null,
    stageId: nullableUuid(row.stageId),
    volume: ["informado", "ate_100", "acima_100"].includes(volume) ? volume : null,
    lostReason: lostReason || null,
  };
}

function rpcArgs(filters: ReturnType<typeof normalizeFilters>) {
  return {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_owner_user_id: filters.ownerUserId,
    p_signal: filters.signal,
    p_region: filters.region,
    p_client_category: filters.clientCategory,
    p_query: filters.query,
    p_stage_id: filters.stageId,
    p_volume: filters.volume,
    p_lost_reason: filters.lostReason,
  };
}

function mapCard(
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
    distributorName: row.distributor_name,
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

export async function POST(request: NextRequest) {
  const part = request.nextUrl.searchParams.get("part") as FilterPart | null;
  if (!part || !["cards", "counts", "kpis"].includes(part)) {
    return NextResponse.json({ ok: false, error: "Parte inválida." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const filters = normalizeFilters(
    body && typeof body === "object" ? (body as Record<string, unknown>).filters : null,
  );
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const args = rpcArgs(filters);

  if (part === "counts") {
    const { data, error } = await crm
      .rpc("pipeline_counts_snapshot", args)
      .abortSignal(request.signal);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const snapshot = data && typeof data === "object" ? data as Record<string, unknown> : {};
    return NextResponse.json({
      ok: true,
      visibleStageCounts: Array.isArray(snapshot.visible_stage_counts) ? snapshot.visible_stage_counts : [],
      allStageCounts: Array.isArray(snapshot.all_stage_counts) ? snapshot.all_stage_counts : [],
      ownerCounts: Array.isArray(snapshot.owner_counts) ? snapshot.owner_counts : [],
    });
  }

  if (part === "kpis") {
    const { data, error } = await crm.rpc("pipeline_owner_summary", args).abortSignal(request.signal);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const summary = data?.[0] ?? null;
    return NextResponse.json({ ok: true, ownerSummary: summary });
  }

  const [cardsResult, profilesResult] = await Promise.all([
    crm.rpc("pipeline_cards_page", {
      ...args,
      p_offset: 0,
      p_limit: 10,
    }).abortSignal(request.signal),
    crm.from("profiles").select("id, full_name").abortSignal(request.signal),
  ]);
  if (cardsResult.error) {
    return NextResponse.json({ ok: false, error: cardsResult.error.message }, { status: 500 });
  }
  if (profilesResult.error) {
    return NextResponse.json({ ok: false, error: profilesResult.error.message }, { status: 500 });
  }

  const rows = (cardsResult.data ?? []) as PipelineCardRow[];
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter(Boolean))];
  let followUps = new Map<string, LeadFollowUpDTO>();
  if (leadIds.length > 0) {
    const { data, error } = await crm
      .from("tasks")
      .select("id, lead_id, title, due_at, assignee_id")
      .in("lead_id", leadIds)
      .eq("task_kind", "follow_up")
      .eq("done", false)
      .order("due_at", { ascending: true })
      .abortSignal(request.signal);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    followUps = indexFollowUpsByLead(data ?? []);
  }
  const ownerNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      (profile.full_name ?? "").trim() || "Sem nome",
    ]),
  );
  return NextResponse.json({
    ok: true,
    cards: rows.map((row) => mapCard(row, ownerNames, followUps)),
  });
}
