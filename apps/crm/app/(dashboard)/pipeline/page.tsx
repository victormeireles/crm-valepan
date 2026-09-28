import {
  isPipelineSignal,
  isPipelineRegion,
  type PipelineSignal,
} from "@/lib/pipeline-signals";
import { isClientCategoryValue, type ClientCategoryValue } from "@/lib/client-categories";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import type { PipelineCardDTO, PipelineStageDTO } from "./pipeline-board";
import { PipelineWorkspace } from "./pipeline-workspace";
import { loadPipelineCardsSnapshot, type PipelineVolumeFilter } from "@/app/actions/pipeline";
import { logPipelinePerformance } from "@/lib/pipeline-performance";
import { selectCanonicalPipelineStages } from "@/lib/pipeline-canonical-stages";

export const dynamic = "force-dynamic";
const INITIAL_CARDS_PER_STAGE = 10;

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  return { id: p.id, label: name };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pageStartedAt = performance.now();
  const renderNowMs = Date.now();
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
  const lostReasonRaw = typeof sp.lost_reason === "string" ? sp.lost_reason.trim() : "";
  const lostReasonFilter = lostReasonRaw.length > 0 && lostReasonRaw.length <= 80 ? lostReasonRaw : null;
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
  const databaseStartedAt = performance.now();
  const [
    { data: stageRows },
    { data: teamProfiles },
    { data: lostReasonRows },
    cardsSnapshot,
  ] = await Promise.all([
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
    crm.from("lost_reasons").select("id, name, stage_key, sort_order, active").order("sort_order", { ascending: true }),
    loadPipelineCardsSnapshot({
      filters: {
        ownerUserId,
        signal: signalFilter,
        region: regionFilter,
        clientCategory: categoryFilter,
        query,
        stageId: stageFilter,
        volume: volumeFilter,
        lostReason: lostReasonFilter,
      },
      includeOwnerNames: false,
    }),
  ]);
  const databaseDurationMs = performance.now() - databaseStartedAt;
  if (!cardsSnapshot.ok) throw new Error(cardsSnapshot.error);

  const rawStages: PipelineStageDTO[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    is_final: s.is_final,
  }));
  const stages = selectCanonicalPipelineStages(rawStages);
  const canonicalIds = new Set(stages.map((stage) => stage.id));

  const ownerNameById = new Map(
    (teamProfiles ?? []).map((profile) => [profile.id, formatTeamOption(profile).label]),
  );

  const pagedCards: PipelineCardDTO[] = cardsSnapshot.cards.map((card) => ({
    ...card,
    ownerName: card.ownerId
      ? (ownerNameById.get(card.ownerId) ?? card.ownerName)
      : null,
  }));

  const stageTotals = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
  const stageBreadCounts = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
  const initialCards = stages.flatMap((stage) =>
    pagedCards.filter((card) => card.stage_id === stage.id).slice(0, INITIAL_CARDS_PER_STAGE),
  );
  for (const card of initialCards) {
    if (!canonicalIds.has(card.stage_id)) continue;
    stageTotals[card.stage_id] = (stageTotals[card.stage_id] ?? 0) + 1;
    stageBreadCounts[card.stage_id] = (stageBreadCounts[card.stage_id] ?? 0)
      + (card.weeklyBreadCount ?? 0);
  }
  const totalCount = initialCards.length;
  const visibleCount = Object.values(stageTotals).reduce((total, count) => total + count, 0);
  const visibleBreadCount = Object.values(stageBreadCounts).reduce((total, count) => total + count, 0);
  const selectedOwnerName = ownerUserId
    ? (ownerNameById.get(ownerUserId) ?? (mineOnly ? "Minha carteira" : "Responsável desconhecido"))
    : null;

  const teamOptions = (teamProfiles ?? []).map((profile) => ({
    ...formatTeamOption(profile),
    count: 0,
  }));
  const mineCount = 0;
  const initialSummary = null;
  logPipelinePerformance("initial_load", performance.now() - pageStartedAt, [
    { operation: "database_parallel", durationMs: Math.round(databaseDurationMs * 10) / 10 },
  ], {
    cards: initialCards.length,
    totalCount,
    stageCount: stages.length,
    hasOwner: Boolean(ownerUserId),
    hasQuery: Boolean(query.trim()),
  });

  return (
    <div className="min-h-0">
      {stages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
      ) : (
        <PipelineWorkspace
          key={[
            ownerUserId ?? "",
            signalFilter ?? "",
            regionFilter ?? "",
            categoryFilter ?? "",
            query,
            stageFilter ?? "",
            volumeFilter ?? "",
            lostReasonFilter ?? "",
          ].join("|")}
          stages={stages}
          initialCards={initialCards}
          initialStageTotals={stageTotals}
          initialStageBreadCounts={stageBreadCounts}
          initialTotalCount={totalCount}
          initialVisibleCount={visibleCount}
          initialVisibleBreadCount={visibleBreadCount}
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
            lostReason: lostReasonFilter,
          }}
          canViewTeam={canViewTeam}
          currentUserId={user?.id ?? null}
          renderNowMs={renderNowMs}
          lostReasons={(lostReasonRows ?? []).map((reason) => ({
            id: reason.id,
            name: reason.name,
            stage_key: reason.stage_key,
            sort_order: reason.sort_order,
            active: reason.active,
          }))}
          suggestionCount={0}
        />
      )}
    </div>
  );
}
