import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import {
  computePipelineSignals,
  isPipelineSignal,
  isPipelineRegion,
  type PipelineSignal,
} from "@/lib/pipeline-signals";
import { isClientCategoryValue, type ClientCategoryValue } from "@/lib/client-categories";
import type { Database } from "@/lib/database.types";
import { INBOX_MESSAGES_VISIBLE_SINCE } from "@/lib/inbox/load-messages";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import type { PipelineCardDTO, PipelineStageDTO } from "./pipeline-board";
import { PipelineWorkspace } from "./pipeline-workspace";
import { getWeeklyVolumeKg } from "@/lib/lead-signals";
import type { PipelineVolumeFilter } from "@/app/actions/pipeline";

export const dynamic = "force-dynamic";
const CARDS_PER_STAGE = 20;

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  return { id: p.id, label: name };
};

type PipelineCardRow = Database["crm"]["Functions"]["pipeline_cards"]["Returns"][number];
type PipelineStageCountRow = Database["crm"]["Functions"]["pipeline_stage_counts"]["Returns"][number];
type PipelineOwnerCountRow = Database["crm"]["Functions"]["pipeline_owner_counts"]["Returns"][number];

function mapRowToCard(o: PipelineCardRow): PipelineCardDTO {
  return {
    id: o.opportunity_id,
    stage_id: o.stage_id,
    title: o.title,
    lost_reason: o.lost_reason,
    lead_id: o.lead_id,
    personName: displayPersonName(o.contact_name),
    companyLine: displayCompanyName({
      companyName: o.company_name,
      distributorName: o.distributor_name,
      clientCategory: o.client_category,
    }),
    client_category: o.client_category,
    distributor_id: o.distributor_id,
    network_type: o.network_type,
    phone_e164: o.phone_e164,
    companyCity: o.company_city,
    companyState: o.company_state,
    conversationId: o.conversation_id,
    weeklyVolumeKg: getWeeklyVolumeKg(
      o.weekly_bread_consumption,
      o.bread_weight_grams,
    ),
    lastDirection: o.last_direction,
    lastSentAt: o.last_sent_at,
    opportunityUpdatedAt: o.opportunity_updated_at,
    nextActionAt: o.next_action_at,
    ownerId: o.opportunity_owner_id ?? o.lead_owner_id,
    ownerName: null,
    signals: computePipelineSignals({
      oppUpdatedAt: o.opportunity_updated_at,
      nextActionAt: o.next_action_at,
      isFinalStage: o.stage_is_final,
      lastMessageDirection: o.last_direction,
    }),
  };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mineOnly = sp.mine === "1";
  const ownerParam = typeof sp.owner === "string" ? sp.owner.trim() : "";
  const signalRaw = typeof sp.signal === "string" ? sp.signal.trim() : "";
  const signalFilter: PipelineSignal | null = isPipelineSignal(signalRaw) ? signalRaw : null;
  const regionRaw = typeof sp.region === "string" ? sp.region.trim() : "";
  const regionFilter = isPipelineRegion(regionRaw) ? regionRaw : null;
  const categoryRaw = typeof sp.client_category === "string" ? sp.client_category.trim() : "";
  const categoryFilter: ClientCategoryValue | null = isClientCategoryValue(categoryRaw)
    ? categoryRaw
    : null;
  const query = typeof sp.q === "string" ? sp.q : "";
  const stageRaw = typeof sp.stage === "string" ? sp.stage.trim() : "";
  const stageFilter = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(stageRaw) ? stageRaw : null;
  const volumeRaw = typeof sp.volume === "string" ? sp.volume.trim() : "";
  const volumeFilter: PipelineVolumeFilter = ["informado", "ate_100", "acima_100"].includes(volumeRaw)
    ? volumeRaw as Exclude<PipelineVolumeFilter, null>
    : null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const crm = crmTables(supabase);
  const { data: currentProfile } = user?.id
    ? await crm.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const canViewTeam = currentProfile?.role === "admin" || currentProfile?.role === "gestao";
  const ownerUserId = canViewTeam
    ? mineOnly && user?.id
      ? user.id
      : ownerParam.length > 0
        ? ownerParam
        : null
    : null;
  const commonFilters = {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_signal: signalFilter,
    p_region: regionFilter,
    p_client_category: categoryFilter,
    p_query: query.trim() || null,
    p_stage_id: stageFilter,
    p_volume: volumeFilter,
  };
  const [
    { data: stageRows },
    { data: teamProfiles },
    { data: rows, error: cardsError },
    { data: allStageCountRows, error: allStageCountsError },
    { data: selectedStageCountRows, error: selectedStageCountsError },
    { data: ownerCountRows, error: ownerCountsError },
    { data: ownerSummaryRows, error: ownerSummaryError },
  ] = await Promise.all([
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
    crm.rpc("pipeline_cards_page", {
      ...commonFilters,
      p_owner_user_id: ownerUserId,
      p_offset: 0,
      p_limit: CARDS_PER_STAGE,
    }),
    crm.rpc("pipeline_stage_counts", { ...commonFilters, p_owner_user_id: null }),
    ownerUserId
      ? crm.rpc("pipeline_stage_counts", { ...commonFilters, p_owner_user_id: ownerUserId })
      : crm.rpc("pipeline_stage_counts", { ...commonFilters, p_owner_user_id: null }),
    crm.rpc("pipeline_owner_counts", commonFilters),
    crm.rpc("pipeline_owner_summary", {
      p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
      p_owner_user_id: ownerUserId,
      p_region: regionFilter,
      p_client_category: categoryFilter,
      p_query: query.trim() || null,
      p_stage_id: stageFilter,
      p_volume: volumeFilter,
    }),
  ]);
  const pipelineError =
    cardsError ??
    allStageCountsError ??
    selectedStageCountsError ??
    ownerCountsError ??
    ownerSummaryError;
  if (pipelineError) throw pipelineError;

  const rawStages: PipelineStageDTO[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    is_final: s.is_final,
  }));
  const entryStages = rawStages.filter((stage) =>
    ["LEADS", "ENTRADA"].includes(stage.name.trim().toUpperCase()),
  );
  const canonicalEntryStage =
    entryStages.find((stage) => stage.name.trim().toUpperCase() === "LEADS") ??
    entryStages[0] ??
    null;
  const entryStageIds = new Set(entryStages.map((stage) => stage.id));
  const stages: PipelineStageDTO[] = rawStages
    .filter((stage) => !entryStageIds.has(stage.id) || stage.id === canonicalEntryStage?.id)
    .map((stage) =>
      stage.id === canonicalEntryStage?.id
        ? { ...stage, name: "LEADS", sort_order: Number.MIN_SAFE_INTEGER, is_final: false }
        : stage,
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  const ownerNameById = new Map(
    (teamProfiles ?? []).map((profile) => [profile.id, formatTeamOption(profile).label]),
  );

  const pagedCards: PipelineCardDTO[] = ((rows ?? []) as PipelineCardRow[]).map((o) => {
    const card = mapRowToCard(o);
    const cardWithOwner = {
      ...card,
      ownerName: card.ownerId
        ? (ownerNameById.get(card.ownerId) ?? "Responsável desconhecido")
        : null,
    };
    return canonicalEntryStage && entryStageIds.has(card.stage_id)
      ? { ...cardWithOwner, stage_id: canonicalEntryStage.id }
      : cardWithOwner;
  });

  const stageTotals = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
  const stageVolumes = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
  for (const row of (selectedStageCountRows ?? []) as PipelineStageCountRow[]) {
    const stageId = canonicalEntryStage && entryStageIds.has(row.stage_id)
      ? canonicalEntryStage.id
      : row.stage_id;
    stageTotals[stageId] = (stageTotals[stageId] ?? 0) + Number(row.card_count);
    stageVolumes[stageId] = (stageVolumes[stageId] ?? 0) + Number(row.volume_kg);
  }
  const initialCards = stages.flatMap((stage) =>
    pagedCards.filter((card) => card.stage_id === stage.id).slice(0, CARDS_PER_STAGE),
  );
  const totalCount = ((allStageCountRows ?? []) as PipelineStageCountRow[]).reduce(
    (total: number, row: PipelineStageCountRow) => total + Number(row.card_count),
    0,
  );
  const visibleCount = Object.values(stageTotals).reduce((total, count) => total + count, 0);
  const visibleVolumeKg = Object.values(stageVolumes).reduce((total, volume) => total + volume, 0);
  const ownerSummary = ownerSummaryRows?.[0] ?? null;
  const selectedOwnerName = ownerUserId
    ? (ownerNameById.get(ownerUserId) ?? (mineOnly ? "Minha carteira" : "Responsável desconhecido"))
    : null;

  const countByOwner = new Map<string, number>(
    ((ownerCountRows ?? []) as PipelineOwnerCountRow[]).map((row: PipelineOwnerCountRow) => [
      row.owner_id,
      Number(row.card_count),
    ]),
  );
  const teamOptions = (teamProfiles ?? []).map((profile) => ({
    ...formatTeamOption(profile),
    count: countByOwner.get(profile.id) ?? 0,
  }));
  const mineCount = user?.id ? (countByOwner.get(user.id) ?? 0) : 0;
  const initialSummary = ownerSummary ? {
    open: Number(ownerSummary.open_count),
    awaiting: Number(ownerSummary.awaiting_reply_count),
    stale: Number(ownerSummary.stale_count),
    overdue: Number(ownerSummary.overdue_count),
  } : null;

  return (
    <div className="min-h-0">
      {stages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
      ) : (
        <PipelineWorkspace
          stages={stages}
          initialCards={initialCards}
          initialStageTotals={stageTotals}
          initialStageVolumes={stageVolumes}
          initialTotalCount={totalCount}
          initialVisibleCount={visibleCount}
          initialVisibleVolumeKg={visibleVolumeKg}
          initialTeamOptions={teamOptions}
          initialMineCount={mineCount}
          initialSummary={initialSummary}
          initialOwnerName={selectedOwnerName}
          initialIsMine={mineOnly}
          initialFilters={{
            ownerUserId,
            signal: signalFilter,
            region: regionFilter,
            clientCategory: categoryFilter,
            query,
            stageId: stageFilter,
            volume: volumeFilter,
          }}
          canViewTeam={canViewTeam}
          currentUserId={user?.id ?? null}
        />
      )}
    </div>
  );
}
