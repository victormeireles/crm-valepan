"use client";

import {
  loadPipelineFilterSnapshot,
  type PipelinePageFilters,
  type PipelineVolumeFilter,
} from "@/app/actions/pipeline";
import { isClientCategoryValue } from "@/lib/client-categories";
import { isPipelineRegion, isPipelineSignal } from "@/lib/pipeline-signals";
import type { LostReasonDTO } from "@/lib/lost-reasons";
import { findCanonicalPipelineStage, visiblePipelineBoardStages } from "@/lib/pipeline-canonical-stages";
import { recordPipelineBrowserMetric } from "@/lib/pipeline-browser-performance";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PipelineBoard, type PipelineCardDTO, type PipelineStageDTO } from "./pipeline-board";
import { PipelineHeader } from "./pipeline-filters";
import { PipelineKpiStrip } from "./pipeline-kpi-strip";

type TeamOption = { id: string; label: string; count: number };
type Summary = { open: number; awaiting: number; stale: number; overdue: number };

function isVolumeFilter(value: string): value is Exclude<PipelineVolumeFilter, null> {
  return ["informado", "ate_100", "acima_100"].includes(value);
}

export function PipelineWorkspace(props: {
  stages: PipelineStageDTO[];
  initialCards: PipelineCardDTO[];
  initialStageTotals: Record<string, number>;
  initialStageBreadCounts: Record<string, number>;
  initialTotalCount: number;
  initialVisibleCount: number;
  initialVisibleBreadCount: number;
  initialTeamOptions: TeamOption[];
  initialMineCount: number;
  initialSummary: Summary | null;
  initialOwnerName: string | null;
  initialIsMine: boolean;
  initialFilters: PipelinePageFilters;
  canViewTeam: boolean;
  currentUserId: string | null;
  renderNowMs: number;
  lostReasons: LostReasonDTO[];
  suggestionCount: number;
}) {
  const [cards, setCards] = useState(props.initialCards);
  const [stageTotals, setStageTotals] = useState(props.initialStageTotals);
  const [stageBreadCounts, setStageBreadCounts] = useState(props.initialStageBreadCounts);
  const [totalCount, setTotalCount] = useState(props.initialTotalCount);
  const [archiveCounts, setArchiveCounts] = useState(() => {
    const clientStage = findCanonicalPipelineStage(props.stages, "CONVERTIDO");
    const lostStage = findCanonicalPipelineStage(props.stages, "PERDIDO");
    return {
      client: clientStage ? props.initialStageTotals[clientStage.id] ?? 0 : 0,
      lost: lostStage ? props.initialStageTotals[lostStage.id] ?? 0 : 0,
    };
  });
  const [teamOptions, setTeamOptions] = useState(props.initialTeamOptions);
  const [mineCount, setMineCount] = useState(props.initialMineCount);
  const [summary, setSummary] = useState<Summary>(props.initialSummary ?? { open: 0, awaiting: 0, stale: 0, overdue: 0 });
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState(props.initialFilters);
  const [nowMs, setNowMs] = useState(props.renderNowMs);
  const filterRequestId = useRef(0);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const changeFilters = useCallback(async (
    patch: Record<string, string | null>,
    historyMode: "push" | "replace" = "push",
  ) => {
    const requestId = ++filterRequestId.current;
    const metricStartedAt = performance.now();
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (patch.owner) params.delete("mine");
    if (patch.mine === "1") params.delete("owner");

    const mine = params.get("mine") === "1";
    const owner = params.get("owner")?.trim() ?? "";
    const signalRaw = params.get("signal") ?? "";
    const regionRaw = params.get("region") ?? "";
    const categoryRaw = params.get("client_category") ?? "";
    const volumeRaw = params.get("volume") ?? "";
    const lostReasonRaw = params.get("lost_reason")?.trim() ?? "";
    const stageRaw = params.get("stage")?.trim() ?? "";
    const ownerUserId = props.canViewTeam
      ? mine ? props.currentUserId : owner || null
      : null;
    const filters: PipelinePageFilters = {
      ownerUserId,
      signal: isPipelineSignal(signalRaw) ? signalRaw : null,
      region: isPipelineRegion(regionRaw) ? regionRaw : null,
      clientCategory: isClientCategoryValue(categoryRaw) ? categoryRaw : null,
      query: params.get("q") ?? "",
      stageId: props.stages.some((stage) => stage.id === stageRaw) ? stageRaw : null,
      volume: isVolumeFilter(volumeRaw) ? volumeRaw : null,
      lostReason: lostReasonRaw.length > 0 && lostReasonRaw.length <= 80 ? lostReasonRaw : null,
    };

    const nextUrl = params.size ? `/pipeline?${params}` : "/pipeline";
    if (historyMode === "replace") {
      window.history.replaceState(window.history.state, "", nextUrl);
    } else {
      window.history.pushState(window.history.state, "", nextUrl);
    }
    setPending(true);
    setLoadError(null);
    let result: Awaited<ReturnType<typeof loadPipelineFilterSnapshot>>;
    try {
      result = await loadPipelineFilterSnapshot({ filters });
    } catch {
      if (requestId === filterRequestId.current) {
        setPending(false);
        setLoadError("Não foi possível concluir a busca. Tente novamente.");
      }
      return;
    }
    if (requestId !== filterRequestId.current) return;
    setPending(false);
    recordPipelineBrowserMetric("filter", metricStartedAt, {
      ok: result.ok,
      cards: result.ok ? result.cards.length : 0,
      hasQuery: Boolean(filters.query),
      stageFiltered: Boolean(filters.stageId),
    });
    if (!result.ok) {
      setLoadError("Não foi possível concluir a busca. Tente novamente.");
      return;
    }
    setActiveFilters(filters);

    const canonicalIds = new Set(props.stages.map((stage) => stage.id));
    setCards(result.cards.filter((card) => canonicalIds.has(card.stage_id)));

    const totals: Record<string, number> = Object.fromEntries(props.stages.map((stage) => [stage.id, 0]));
    const breadCounts: Record<string, number> = Object.fromEntries(props.stages.map((stage) => [stage.id, 0]));
    for (const row of result.visibleStageCounts as { stage_id: string; card_count: number; volume_kg: number }[]) {
      if (!canonicalIds.has(row.stage_id)) continue;
      totals[row.stage_id] = (totals[row.stage_id] ?? 0) + Number(row.card_count);
      // `volume_kg` é mantido pela RPC por compatibilidade, mas contém pães/semana.
      breadCounts[row.stage_id] = (breadCounts[row.stage_id] ?? 0) + Number(row.volume_kg);
    }
    setStageTotals(totals);
    setStageBreadCounts(breadCounts);
    if (!filters.stageId) {
      const clientStage = findCanonicalPipelineStage(props.stages, "CONVERTIDO");
      const lostStage = findCanonicalPipelineStage(props.stages, "PERDIDO");
      setArchiveCounts({
        client: clientStage ? totals[clientStage.id] ?? 0 : 0,
        lost: lostStage ? totals[lostStage.id] ?? 0 : 0,
      });
    }

    const allStageCounts = result.allStageCounts as { stage_id: string; card_count: number }[];
    const rawOwnerCounts = result.ownerCounts as { owner_id: string; card_count: number }[];
    setTotalCount(
      allStageCounts.reduce(
        (sum, row) => (canonicalIds.has(row.stage_id) ? sum + Number(row.card_count) : sum),
        0,
      ),
    );
    const ownerCounts = new Map(rawOwnerCounts.map((row) => [row.owner_id, Number(row.card_count)]));
    setTeamOptions(props.initialTeamOptions.map((option) => ({ ...option, count: ownerCounts.get(option.id) ?? 0 })));
    setMineCount(props.currentUserId ? ownerCounts.get(props.currentUserId) ?? 0 : 0);
    const rawSummary = result.ownerSummary;
    setSummary(rawSummary ? {
      open: Number(rawSummary.open_count),
      awaiting: Number(rawSummary.awaiting_reply_count),
      stale: Number(rawSummary.stale_count),
      overdue: Number(rawSummary.overdue_count),
    } : { open: 0, awaiting: 0, stale: 0, overdue: 0 });
  }, [props.canViewTeam, props.currentUserId, props.initialTeamOptions, props.stages]);

  const hasAnyFilter = useMemo(
    () => Boolean(
      activeFilters.ownerUserId ||
      activeFilters.signal ||
      activeFilters.region ||
      activeFilters.clientCategory ||
      activeFilters.query ||
      activeFilters.stageId ||
      activeFilters.volume ||
      activeFilters.lostReason
    ),
    [activeFilters],
  );

  const boardStages = useMemo(
    () => visiblePipelineBoardStages(props.stages, activeFilters.stageId),
    [props.stages, activeFilters.stageId],
  );
  const boardVisibleCount = useMemo(
    () => boardStages.reduce((sum, stage) => sum + (stageTotals[stage.id] ?? 0), 0),
    [boardStages, stageTotals],
  );
  const boardVisibleBreadCount = useMemo(
    () => boardStages.reduce((sum, stage) => sum + (stageBreadCounts[stage.id] ?? 0), 0),
    [boardStages, stageBreadCounts],
  );
  const headerStageTotals = useMemo(() => {
    const next = { ...stageTotals };
    const clientStage = findCanonicalPipelineStage(props.stages, "CONVERTIDO");
    const lostStage = findCanonicalPipelineStage(props.stages, "PERDIDO");
    if (clientStage) next[clientStage.id] = archiveCounts.client;
    if (lostStage) next[lostStage.id] = archiveCounts.lost;
    return next;
  }, [archiveCounts, props.stages, stageTotals]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PipelineHeader
        stages={props.stages}
        totalCount={totalCount}
        teamOptions={teamOptions}
        mineCount={mineCount}
        canViewTeam={props.canViewTeam}
        currentUserId={props.currentUserId}
        filters={activeFilters}
        pending={pending}
        hasAnyFilter={hasAnyFilter}
        lostReasons={props.lostReasons}
        stageTotals={headerStageTotals}
        suggestionCount={props.suggestionCount}
        onFilterChange={changeFilters}
      />
      <PipelineKpiStrip
        awaiting={summary.awaiting}
        overdue={summary.overdue}
        stale={summary.stale}
        weeklyBreadCount={boardVisibleBreadCount}
        activeSignal={activeFilters.signal}
        onSignalChange={(signal) => void changeFilters({ signal })}
      />
      {loadError ? (
        <p role="alert" className="rounded-xl border border-[rgba(186,26,26,0.25)] bg-[rgba(186,26,26,0.08)] px-4 py-3 text-sm text-[var(--vp-error)]">
          {loadError} A tela e os dados anteriores foram preservados.
        </p>
      ) : null}
      {boardVisibleCount === 0 ? (
        <p className="rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-4 py-10 text-center text-sm text-[var(--vp-ink-muted)]">
          Nenhuma oportunidade corresponde aos filtros selecionados.
        </p>
      ) : (
        <PipelineBoard
          stages={props.stages}
          initialCards={cards}
          stageTotals={stageTotals}
          stageBreadCounts={stageBreadCounts}
          filters={activeFilters}
          nowMs={nowMs}
          teamOptions={teamOptions.map(({ id, label }) => ({ id, label }))}
          currentUserId={props.currentUserId}
          lostReasons={props.lostReasons}
          onReturnToOpenFunnel={() => void changeFilters({ stage: null, lost_reason: null })}
        />
      )}
    </div>
  );
}
