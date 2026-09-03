"use client";

import {
  loadPipelineFilterSnapshot,
  type PipelinePageFilters,
  type PipelineVolumeFilter,
} from "@/app/actions/pipeline";
import { isClientCategoryValue } from "@/lib/client-categories";
import { isPipelineRegion, isPipelineSignal } from "@/lib/pipeline-signals";
import { recordPipelineBrowserMetric } from "@/lib/pipeline-browser-performance";
import { useCallback, useMemo, useState } from "react";
import { PipelineBoard, type PipelineCardDTO, type PipelineStageDTO } from "./pipeline-board";
import { PipelineFilters, PipelineHeader } from "./pipeline-filters";
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
  initialStageVolumes: Record<string, number>;
  initialTotalCount: number;
  initialVisibleCount: number;
  initialVisibleVolumeKg: number;
  initialTeamOptions: TeamOption[];
  initialMineCount: number;
  initialSummary: Summary | null;
  initialOwnerName: string | null;
  initialIsMine: boolean;
  initialFilters: PipelinePageFilters;
  canViewTeam: boolean;
  currentUserId: string | null;
}) {
  const [cards, setCards] = useState(props.initialCards);
  const [stageTotals, setStageTotals] = useState(props.initialStageTotals);
  const [stageVolumes, setStageVolumes] = useState(props.initialStageVolumes);
  const [totalCount, setTotalCount] = useState(props.initialTotalCount);
  const [visibleCount, setVisibleCount] = useState(props.initialVisibleCount);
  const [visibleVolumeKg, setVisibleVolumeKg] = useState(props.initialVisibleVolumeKg);
  const [teamOptions, setTeamOptions] = useState(props.initialTeamOptions);
  const [mineCount, setMineCount] = useState(props.initialMineCount);
  const [summary, setSummary] = useState<Summary>(props.initialSummary ?? { open: 0, awaiting: 0, stale: 0, overdue: 0 });
  const [pending, setPending] = useState(false);
  const [activeFilters, setActiveFilters] = useState(props.initialFilters);

  const changeFilters = useCallback(async (patch: Record<string, string | null>) => {
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
    };

    window.history.pushState(null, "", params.size ? `/pipeline?${params}` : "/pipeline");
    setPending(true);
    const result = await loadPipelineFilterSnapshot({ filters });
    setPending(false);
    recordPipelineBrowserMetric("filter", metricStartedAt, {
      ok: result.ok,
      cards: result.ok ? result.cards.length : 0,
      hasQuery: Boolean(filters.query),
      stageFiltered: Boolean(filters.stageId),
    });
    if (!result.ok) return;
    setActiveFilters(filters);

    const entryStages = props.stages.filter((stage) =>
      ["LEADS", "ENTRADA"].includes(stage.name.trim().toUpperCase()),
    );
    const canonical = entryStages.find((stage) => stage.name.trim().toUpperCase() === "LEADS") ?? entryStages[0];
    const entryIds = new Set(entryStages.map((stage) => stage.id));
    const normalizeStage = (stageId: string) => canonical && entryIds.has(stageId) ? canonical.id : stageId;
    setCards(result.cards.map((card) => ({ ...card, stage_id: normalizeStage(card.stage_id) })));

    const totals: Record<string, number> = Object.fromEntries(props.stages.map((stage) => [stage.id, 0]));
    const volumes: Record<string, number> = Object.fromEntries(props.stages.map((stage) => [stage.id, 0]));
    for (const row of result.visibleStageCounts as { stage_id: string; card_count: number; volume_kg: number }[]) {
      const id = normalizeStage(row.stage_id);
      totals[id] = (totals[id] ?? 0) + Number(row.card_count);
      volumes[id] = (volumes[id] ?? 0) + Number(row.volume_kg);
    }
    setStageTotals(totals);
    setStageVolumes(volumes);
    setVisibleCount(Object.values(totals).reduce((sum, value) => sum + value, 0));
    setVisibleVolumeKg(Object.values(volumes).reduce((sum, value) => sum + value, 0));

    const allStageCounts = result.allStageCounts as { stage_id: string; card_count: number }[];
    const rawOwnerCounts = result.ownerCounts as { owner_id: string; card_count: number }[];
    setTotalCount(allStageCounts.reduce((sum, row) => sum + Number(row.card_count), 0));
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
      activeFilters.volume
    ),
    [activeFilters],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PipelineHeader
        visibleCount={visibleCount}
        volumeKg={visibleVolumeKg}
        totalCount={totalCount}
        teamOptions={teamOptions}
        mineCount={mineCount}
        canViewTeam={props.canViewTeam}
        currentUserId={props.currentUserId}
        filters={activeFilters}
        pending={pending}
        onFilterChange={changeFilters}
      />
      <PipelineKpiStrip
        awaiting={summary.awaiting}
        overdue={summary.overdue}
        stale={summary.stale}
        volumeKg={visibleVolumeKg}
        activeSignal={activeFilters.signal}
        onSignalChange={(signal) => void changeFilters({ signal })}
      />
      <PipelineFilters
        stages={props.stages}
        filters={activeFilters}
        hasAnyFilter={hasAnyFilter}
        onFilterChange={changeFilters}
      />
      {visibleCount === 0 ? (
        <p className="rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-4 py-10 text-center text-sm text-[var(--vp-ink-muted)]">
          Nenhuma oportunidade corresponde aos filtros selecionados.
        </p>
      ) : (
        <PipelineBoard
          stages={props.stages}
          initialCards={cards}
          stageTotals={stageTotals}
          stageVolumes={stageVolumes}
          filters={activeFilters}
        />
      )}
    </div>
  );
}
