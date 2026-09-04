"use client";

import { updateOpportunityStage } from "@/app/actions/opportunity";
import {
  loadPipelineStagePage,
  type PipelinePageFilters,
} from "@/app/actions/pipeline";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PipelineSignal } from "@/lib/pipeline-signals";
import { recordPipelineBrowserMetric } from "@/lib/pipeline-browser-performance";
import { CrmIcon } from "@/components/crm-icon";
import { formatBrazilPhoneForDisplay } from "@/lib/lead-identity";
import { LeadFollowUp } from "@/components/lead-follow-up";
import type { LeadFollowUpDTO } from "@/lib/follow-ups";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PipelineSignalBadges } from "./pipeline-signal-badges";

export type PipelineStageDTO = {
  id: string;
  name: string;
  sort_order: number;
  is_final: boolean;
};

export type PipelineCardDTO = {
  id: string;
  stage_id: string;
  title: string | null;
  lost_reason: string | null;
  lead_id: string | null;
  personName: string;
  companyLine: string | null;
  phone_e164: string | null;
  client_category: string | null;
  ownerName: string | null;
  signals: PipelineSignal[];
  companyCity: string | null;
  companyState: string | null;
  conversationId: string | null;
  weeklyBreadCount: number | null;
  lastDirection: string | null;
  lastSentAt: string | null;
  opportunityUpdatedAt: string;
  nextActionAt: string | null;
  followUp: LeadFollowUpDTO | null;
  ownerId: string | null;
};

function groupByStage(
  stages: PipelineStageDTO[],
  cards: PipelineCardDTO[],
): Map<string, PipelineCardDTO[]> {
  const m = new Map<string, PipelineCardDTO[]>();
  for (const s of stages) m.set(s.id, []);
  const fallback = stages[0]?.id ?? null;
  for (const c of cards) {
    const key = m.has(c.stage_id) ? c.stage_id : fallback;
    if (key) m.get(key)!.push(c);
  }
  return m;
}

function cloneColumns(map: Map<string, PipelineCardDTO[]>) {
  const next = new Map<string, PipelineCardDTO[]>();
  for (const [k, v] of map) next.set(k, [...v]);
  return next;
}

function moveCard(
  columns: Map<string, PipelineCardDTO[]>,
  opportunityId: string,
  fromStageId: string,
  toStageId: string,
): Map<string, PipelineCardDTO[]> | null {
  const next = cloneColumns(columns);
  const fromList = next.get(fromStageId);
  if (!fromList) return null;
  const idx = fromList.findIndex((c) => c.id === opportunityId);
  if (idx === -1) return null;
  const [card] = fromList.splice(idx, 1);
  if (!card) return null;
  const updated = { ...card, stage_id: toStageId };
  const toList = next.get(toStageId);
  // Etapas finais ficam fora das colunas ativas; remover da origem já é o
  // estado otimista correto até a atualização dos dados do servidor.
  if (!toList) return next;
  toList.unshift(updated);
  return next;
}

function useDesktopDrag() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return enabled;
}

function DroppableColumn({
  stageId,
  stageName,
  totalCount,
  weeklyBreadCount,
  maxWeeklyBreadCount,
  children,
}: {
  stageId: string;
  stageName: string;
  totalCount: number;
  weeklyBreadCount: number;
  maxWeeklyBreadCount: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stageId}`,
    data: { type: "column" as const, stageId },
  });

  return (
    <section
      ref={setNodeRef}
      title={stageName}
      className={`flex h-[min(62vh,42rem)] min-w-0 snap-start flex-col rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-surface-low)] p-2.5 ${
        isOver ? "ring-2 ring-[var(--vp-gold-deep)] ring-offset-1 ring-offset-[var(--vp-paper)]" : ""
      }`}
    >
      <header className="shrink-0 px-1 pb-2.5 pt-0.5">
        <div className="flex items-baseline justify-between gap-1.5">
          <h2 className="truncate text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--vp-wine)]">{stageName}</h2>
          <span className="text-[13px] font-extrabold tabular-nums text-[var(--vp-ink-body)]">{totalCount.toLocaleString("pt-BR")}</span>
        </div>
        <p className="mb-1.5 mt-0.5 text-[11px] tabular-nums text-[var(--vp-ink-muted)]">{weeklyBreadCount.toLocaleString("pt-BR")} pães/sem</p>
        <div className="h-[3px] overflow-hidden rounded-full bg-[rgba(35,0,4,0.1)]">
          <div
            className="h-full rounded-full bg-[var(--vp-gold-classic)]"
            style={{ width: `${maxWeeklyBreadCount > 0 ? Math.max(3, (weeklyBreadCount / maxWeeklyBreadCount) * 100) : 0}%` }}
          />
        </div>
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-0.5 pb-0.5">
        {children}
      </ul>
    </section>
  );
}

function DraggableCard({
  card,
  stageId,
  stages,
  onOpen,
  onOpenFollowUp,
  onMove,
  onClose,
  nowMs,
}: {
  card: PipelineCardDTO;
  stageId: string;
  stages: PipelineStageDTO[];
  onOpen: () => void;
  onOpenFollowUp: (card: PipelineCardDTO) => void;
  onMove: (opportunityId: string, fromStageId: string, toStageId: string) => void;
  onClose: (card: PipelineCardDTO, stageId: string) => void;
  nowMs: number;
}) {
  const dragEnabled = useDesktopDrag();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `opp:${card.id}`,
    disabled: !dragEnabled,
    data: {
      type: "opportunity" as const,
      opportunityId: card.id,
      stageId,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const ownerInitials = card.ownerName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const categoryLetter = card.client_category?.trim()[0]?.toLocaleUpperCase("pt-BR") ?? null;
  const formattedPhone = formatBrazilPhoneForDisplay(card.phone_e164);
  const regionLabel = [card.companyState, card.companyCity].filter(Boolean).join(" · ") || null;
  const borderSignal = card.signals.includes("awaiting_reply")
    ? "border-l-[var(--vp-error)]"
    : card.signals.includes("followup_overdue")
      ? "border-l-[var(--vp-gold-classic)]"
      : card.signals.includes("stale")
        ? "border-l-[var(--vp-ink-soft)]"
        : "border-l-[var(--vp-ink-line)]";
  const stopPointer = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
      role="button"
      className={`cursor-pointer rounded-xl border border-l-[3px] border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 pb-2.5 pt-[11px] shadow-[var(--sh-sm)] md:touch-none md:cursor-grab md:active:cursor-grabbing ${borderSignal} ${
        isDragging ? "opacity-40" : ""
      }`}
      tabIndex={0}
      aria-label={`${card.personName}. Abrir oportunidade`}
      title={[card.personName, formattedPhone, card.companyLine].filter(Boolean).join(" · ")}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-[var(--vp-ink-body)]">{card.personName}</p>
          {formattedPhone ? (
            <p className="mt-0.5 truncate text-xs tabular-nums text-[var(--vp-ink-muted)]">{formattedPhone}</p>
          ) : null}
          {card.companyLine ? (
            <p className="mt-0.5 truncate text-xs text-[var(--vp-ink-muted)]">{card.companyLine}</p>
          ) : null}
        </div>
        {categoryLetter ? (
          <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] text-[10px] font-extrabold text-[var(--vp-wine)]" aria-label={`Categoria: ${card.client_category}`}>
            {categoryLetter}
          </span>
        ) : null}
      </div>
      {regionLabel || card.weeklyBreadCount != null ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {regionLabel ? (
            <span className="rounded-full bg-[var(--vp-surface)] px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-[var(--vp-ink-muted)]">{regionLabel}</span>
          ) : null}
          {card.weeklyBreadCount != null ? (
            <span className="rounded-full bg-[var(--vp-surface)] px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-[var(--vp-ink-muted)]">
              {card.weeklyBreadCount.toLocaleString("pt-BR")} pães/sem
            </span>
          ) : null}
        </div>
      ) : null}
      <PipelineSignalBadges
        lastDirection={card.lastDirection}
        lastSentAt={card.lastSentAt}
        opportunityUpdatedAt={card.opportunityUpdatedAt}
        nextActionAt={card.nextActionAt}
        followUpTitle={card.followUp?.title ?? null}
        nowMs={nowMs}
      />
      <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-[var(--vp-surface-high)] pt-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--vp-gold)] text-[9px] font-extrabold text-[var(--vp-wine)]">{ownerInitials || "—"}</span>
          <span className="truncate text-[11px] text-[var(--vp-ink-muted)]">{card.ownerName ?? "Sem responsável"}</span>
        </span>
        <span className="relative inline-flex shrink-0 items-center gap-0.5">
          {card.conversationId ? (
            <Link
              href={`/inbox?cid=${card.conversationId}`}
              title="Responder no chat"
              aria-label={`Responder ${card.personName} no chat`}
              className="grid size-11 place-items-center rounded-lg bg-[var(--vp-surface)] text-[var(--vp-wine)] md:size-7"
              onPointerDown={stopPointer}
              onClick={stopPointer}
            >
              <CrmIcon name="chat" className="text-[17px]" />
            </Link>
          ) : null}
          {card.lead_id ? (
            <button
              type="button"
              title="Follow-up"
              aria-label={`Follow-up de ${card.personName}`}
              className="grid size-11 place-items-center rounded-lg bg-[var(--vp-surface)] text-[var(--vp-wine)] md:size-7"
              onPointerDown={stopPointer}
              onClick={(event) => {
                stopPointer(event);
                onOpenFollowUp(card);
              }}
            >
              <CrmIcon name="event" className="text-[17px]" />
            </button>
          ) : null}
          <details className="group relative" onPointerDown={stopPointer} onClick={stopPointer}>
            <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-lg bg-[var(--vp-surface)] text-[var(--vp-wine)] marker:content-none md:size-7 [&::-webkit-details-marker]:hidden" aria-label="Mais ações">
              <CrmIcon name="more_horiz" className="text-[17px]" />
            </summary>
            <div className="absolute bottom-full right-0 z-30 mb-1 min-w-52 overflow-hidden rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] py-1 shadow-[var(--sh-md)]">
              <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--vp-ink-soft)] md:hidden">Mover para</p>
              {stages.filter((stage) => !stage.is_final && stage.id !== stageId).map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className="block min-h-11 w-full px-3 text-left text-xs text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)] md:hidden"
                  onClick={() => onMove(card.id, stageId, stage.id)}
                >
                  {stage.name}
                </button>
              ))}
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-[var(--vp-error)] hover:bg-[var(--vp-surface)]"
                onClick={() => onClose(card, stageId)}
              >
                <CrmIcon name="block" className="text-base" />
                Encerrar oportunidade
              </button>
            </div>
          </details>
        </span>
      </div>
    </li>
  );
}

function CardPreview({ card }: { card: PipelineCardDTO }) {
  const formattedPhone = formatBrazilPhoneForDisplay(card.phone_e164);

  return (
    <div className="pointer-events-none w-56 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 shadow-[var(--sh-lg)]">
      <p className="truncate text-sm font-bold text-[var(--vp-ink-body)]">{card.personName}</p>
      {formattedPhone ? (
        <p className="mt-0.5 truncate text-xs tabular-nums text-[var(--vp-ink-muted)]">{formattedPhone}</p>
      ) : null}
      {card.companyLine ? (
        <p className="mt-0.5 truncate text-xs text-[var(--vp-ink-muted)]">{card.companyLine}</p>
      ) : null}
    </div>
  );
}

export function PipelineBoard({
  stages,
  initialCards,
  stageTotals,
  stageBreadCounts,
  filters,
  nowMs,
  teamOptions,
  currentUserId,
}: {
  stages: PipelineStageDTO[];
  initialCards: PipelineCardDTO[];
  stageTotals: Record<string, number>;
  stageBreadCounts: Record<string, number>;
  filters: PipelinePageFilters;
  nowMs: number;
  teamOptions: { id: string; label: string }[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const activeStages = useMemo(() => stages.filter((stage) => !stage.is_final), [stages]);
  const finalStages = useMemo(() => stages.filter((stage) => stage.is_final), [stages]);
  const closedCards = useMemo(
    () => initialCards.filter((card) => finalStages.some((stage) => stage.id === card.stage_id)),
    [finalStages, initialCards],
  );

  const fingerprint = useMemo(
    () => initialCards.map((c) => [
      c.id,
      c.stage_id,
      c.followUp?.id ?? "",
      c.followUp?.title ?? "",
      c.followUp?.due_at ?? "",
      c.followUp?.assignee_id ?? "",
    ].join(":")).join("|"),
    [initialCards],
  );

  const [columns, setColumns] = useState(() => groupByStage(activeStages, initialCards));
  const [localStageTotals, setLocalStageTotals] = useState(stageTotals);
  const [localStageBreadCounts, setLocalStageBreadCounts] = useState(stageBreadCounts);
  const [loadingStageId, setLoadingStageId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<PipelineCardDTO | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<{
    opportunityId: string;
    fromStageId: string;
    personName: string;
  } | null>(null);
  const [closingStageId, setClosingStageId] = useState("");
  const [closingReason, setClosingReason] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);
  const [followUpCardId, setFollowUpCardId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const followUpDialogRef = useRef<HTMLDialogElement>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const stageTotalsRef = useRef(localStageTotals);
  stageTotalsRef.current = localStageTotals;
  const stageBreadCountsRef = useRef(localStageBreadCounts);
  stageBreadCountsRef.current = localStageBreadCounts;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  useEffect(() => {
    const next = groupByStage(activeStages, initialCards);
    setColumns(next);
    columnsRef.current = next;
    setLocalStageTotals(stageTotals);
    stageTotalsRef.current = stageTotals;
    setLocalStageBreadCounts(stageBreadCounts);
    stageBreadCountsRef.current = stageBreadCounts;
  }, [fingerprint, activeStages, initialCards, stageTotals, stageBreadCounts]);

  const loadMore = useCallback(
    async (stageId: string) => {
      const metricStartedAt = performance.now();
      setLoadingStageId(stageId);
      setBannerError(null);
      const current = columnsRef.current.get(stageId) ?? [];
      const result = await loadPipelineStagePage({ stageId, offset: current.length, filters });
      recordPipelineBrowserMetric("page", metricStartedAt, {
        ok: result.ok,
        stageId,
        offset: current.length,
        cards: result.ok ? result.cards.length : 0,
      });
      setLoadingStageId(null);
      if (!result.ok) {
        setBannerError(result.error ?? "Não foi possível carregar mais oportunidades.");
        return;
      }
      const next = cloneColumns(columnsRef.current);
      const existing = new Set(current.map((card) => card.id));
      next.set(stageId, [...current, ...result.cards.filter((card) => !existing.has(card.id))]);
      setColumns(next);
      columnsRef.current = next;
    },
    [filters],
  );

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (pendingClose) {
      setClosingStageId(finalStages[0]?.id ?? "");
      setClosingReason("");
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [finalStages, pendingClose]);

  const followUpCard = followUpCardId
    ? Array.from(columns.values()).flat().find((card) => card.id === followUpCardId) ?? null
    : null;

  useEffect(() => {
    const dialog = followUpDialogRef.current;
    if (!dialog) return;
    if (followUpCard) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [followUpCard]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const commitMove = useCallback(
    async (
      opportunityId: string,
      fromStageId: string,
      toStageId: string,
      lostReason: string | null,
    ): Promise<boolean> => {
      const metricStartedAt = performance.now();
      setBannerError(null);
      setBannerSuccess(null);
      setSavingId(opportunityId);
      const prev = cloneColumns(columnsRef.current);
      const prevTotals = { ...stageTotalsRef.current };
      const prevBreadCounts = { ...stageBreadCountsRef.current };
      const movedCard = prev.get(fromStageId)?.find((card) => card.id === opportunityId) ?? null;
      const optimistic = moveCard(columnsRef.current, opportunityId, fromStageId, toStageId);
      if (!optimistic) {
        setSavingId(null);
        return false;
      }
      setColumns(optimistic);
      columnsRef.current = optimistic;
      if (fromStageId !== toStageId) {
        const nextTotals = { ...prevTotals };
        nextTotals[fromStageId] = Math.max(0, (nextTotals[fromStageId] ?? 0) - 1);
        nextTotals[toStageId] = (nextTotals[toStageId] ?? 0) + 1;
        setLocalStageTotals(nextTotals);
        stageTotalsRef.current = nextTotals;

        const weeklyBreadCount = movedCard?.weeklyBreadCount ?? 0;
        if (weeklyBreadCount > 0) {
          const nextBreadCounts = { ...prevBreadCounts };
          nextBreadCounts[fromStageId] = Math.max(0, (nextBreadCounts[fromStageId] ?? 0) - weeklyBreadCount);
          nextBreadCounts[toStageId] = (nextBreadCounts[toStageId] ?? 0) + weeklyBreadCount;
          setLocalStageBreadCounts(nextBreadCounts);
          stageBreadCountsRef.current = nextBreadCounts;
        }
      }

      const res = await updateOpportunityStage({
        opportunityId,
        stageId: toStageId,
        lostReason,
      });
      recordPipelineBrowserMetric("move", metricStartedAt, {
        ok: res.ok,
        fromStageId,
        toStageId,
      });

      setSavingId(null);
      if (!res.ok) {
        setColumns(prev);
        columnsRef.current = prev;
        setLocalStageTotals(prevTotals);
        stageTotalsRef.current = prevTotals;
        setLocalStageBreadCounts(prevBreadCounts);
        stageBreadCountsRef.current = prevBreadCounts;
        setBannerError(res.error ?? "Não foi possível atualizar a etapa.");
        return false;
      }
      if (res.tasksCreated > 0) {
        const n = res.tasksCreated;
        setBannerSuccess(
          n === 1
            ? "1 tarefa automática criada para esta etapa."
            : `${n} tarefas automáticas criadas para esta etapa.`,
        );
      }
      return true;
    },
    [],
  );

  const updateCardFollowUp = useCallback((cardId: string, followUp: LeadFollowUpDTO | null) => {
    const next = cloneColumns(columnsRef.current);
    for (const [stageId, cards] of next) {
      const cardIndex = cards.findIndex((card) => card.id === cardId);
      if (cardIndex < 0) continue;
      const card = cards[cardIndex];
      const signals: PipelineSignal[] = card.signals.filter((signal) => signal !== "followup_overdue");
      if (followUp && new Date(followUp.due_at).getTime() < Date.now()) {
        signals.push("followup_overdue");
      }
      cards[cardIndex] = {
        ...card,
        followUp,
        nextActionAt: followUp?.due_at ?? null,
        signals,
      };
      next.set(stageId, cards);
      break;
    }
    columnsRef.current = next;
    setColumns(next);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; opportunityId?: string; stageId?: string }
      | undefined;
    if (data?.type !== "opportunity" || !data.opportunityId || !data.stageId) return;
    const list = columnsRef.current.get(data.stageId) ?? [];
    const card = list.find((c) => c.id === data.opportunityId) ?? null;
    setActiveCard(card);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { type?: string; opportunityId?: string; stageId?: string }
        | undefined;
      if (activeData?.type !== "opportunity" || !activeData.opportunityId || !activeData.stageId) return;

      const fromStageId = activeData.stageId;
      let targetStageId: string | null = null;
      const overData = over.data.current as { type?: string; stageId?: string } | undefined;

      if (overData?.type === "column" && overData.stageId) targetStageId = overData.stageId;
      else if (overData?.type === "opportunity" && overData.stageId) targetStageId = overData.stageId;

      if (!targetStageId || targetStageId === fromStageId) return;

      const targetStage = stagesRef.current.find((s) => s.id === targetStageId);
      if (!targetStage) return;

      void commitMove(activeData.opportunityId, fromStageId, targetStageId, null);
    },
    [commitMove],
  );

  async function confirmClose() {
    if (!pendingClose || !closingStageId) return;
    const targetStage = finalStages.find((stage) => stage.id === closingStageId);
    if (!targetStage) return;
    const isConverted = targetStage.name.toLowerCase().includes("convertido");
    const trimmed = closingReason.trim();
    if (!isConverted && !trimmed) {
      setBannerError("Informe o motivo do encerramento.");
      return;
    }
    setClosingBusy(true);
    setBannerError(null);
    const ok = await commitMove(
      pendingClose.opportunityId,
      pendingClose.fromStageId,
      closingStageId,
      isConverted ? null : trimmed,
    );
    setClosingBusy(false);
    if (ok) setPendingClose(null);
  }

  function cancelClose() {
    setPendingClose(null);
    setClosingReason("");
    setBannerError(null);
  }
  const maxWeeklyBreadCount = Math.max(0, ...activeStages.map((stage) => localStageBreadCounts[stage.id] ?? 0));

  return (
    <DndContext
      id="pipeline-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {bannerError ? (
        <p className="rounded border border-[var(--vp-error)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--vp-error)]">
          {bannerError}
        </p>
      ) : null}
      {bannerSuccess ? (
        <p className="rounded border border-[var(--vp-gold-classic)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--vp-wine)]">
          {bannerSuccess}
        </p>
      ) : null}

      <div className="w-full min-w-0 overflow-x-auto pb-1 [scrollbar-gutter:stable]">
        <div
          className="grid w-max min-w-full snap-x snap-mandatory grid-flow-col auto-cols-[calc(100vw-3rem)] gap-3 md:grid-flow-row md:auto-cols-auto md:[grid-template-columns:repeat(var(--pipeline-stage-count),minmax(13rem,1fr))] md:[width:max(100%,calc(var(--pipeline-stage-count)*13.75rem))]"
          style={{ "--pipeline-stage-count": activeStages.length } as CSSProperties}
        >
          {activeStages.map((stage) => {
            const items = columns.get(stage.id) ?? [];
            const totalCount = localStageTotals[stage.id] ?? items.length;
            const hasMore = items.length < totalCount;
            return (
              <DroppableColumn
                key={stage.id}
                stageId={stage.id}
                stageName={stage.name}
                totalCount={totalCount}
                weeklyBreadCount={localStageBreadCounts[stage.id] ?? 0}
                maxWeeklyBreadCount={maxWeeklyBreadCount}
              >
                {items.map((card) => (
                  <DraggableCard
                    key={card.id}
                    card={card}
                    stageId={stage.id}
                    stages={activeStages}
                    nowMs={nowMs}
                    onOpen={() => card.lead_id && router.push(`/leads/${card.lead_id}`)}
                    onOpenFollowUp={(selectedCard) => setFollowUpCardId(selectedCard.id)}
                    onMove={(opportunityId, fromStageId, toStageId) => {
                      void commitMove(opportunityId, fromStageId, toStageId, null);
                    }}
                    onClose={(selectedCard, fromStageId) =>
                      setPendingClose({
                        opportunityId: selectedCard.id,
                        fromStageId,
                        personName: selectedCard.personName,
                      })
                    }
                  />
                ))}
                {items.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-[var(--vp-ink-soft)]">
                    Nenhuma oportunidade nesta etapa.
                  </li>
                ) : null}
                {hasMore ? (
                  <li className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-center gap-1.5 border-t border-[var(--vp-ink-line)] bg-[var(--vp-surface-low)] px-1 py-2">
                    <button
                      type="button"
                      className="min-h-11 rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[11px] font-bold text-[var(--vp-wine)] hover:border-[var(--vp-gold-classic)] disabled:opacity-50 md:min-h-8"
                      onClick={() => void loadMore(stage.id)}
                      disabled={loadingStageId === stage.id}
                    >
                      {loadingStageId === stage.id ? "Carregando…" : "Ver mais"}
                    </button>
                    <span className="basis-full text-center text-[10px] tabular-nums text-[var(--muted)]">
                      Carregados {items.length} de {totalCount}
                    </span>
                  </li>
                ) : null}
              </DroppableColumn>
            );
          })}
        </div>
      </div>

      <DragOverlay>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>

      <dialog
        ref={followUpDialogRef}
        className="w-[min(24rem,calc(100%_-_2rem))] rounded-2xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] p-0 text-[var(--vp-ink-body)] shadow-[var(--sh-lg)] backdrop:bg-black/40"
        onCancel={(event) => {
          event.preventDefault();
          setFollowUpCardId(null);
        }}
        onClose={() => setFollowUpCardId(null)}
      >
        {followUpCard?.lead_id ? (
          <div className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3 border-b border-[var(--vp-ink-line)] pb-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-[var(--vp-wine)]">{followUpCard.personName}</h3>
                <p className="mt-0.5 text-xs text-[var(--vp-ink-muted)]">Agendamento deste lead</p>
              </div>
              <button
                type="button"
                aria-label="Fechar follow-up"
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] text-[var(--vp-wine)]"
                onClick={() => setFollowUpCardId(null)}
              >
                <CrmIcon name="close" className="text-lg" />
              </button>
            </div>
            <LeadFollowUp
              key={followUpCard.id}
              leadId={followUpCard.lead_id}
              initialFollowUp={followUpCard.followUp}
              teamOptions={teamOptions}
              defaultAssigneeId={followUpCard.ownerId ?? currentUserId}
              compact
              onChange={(followUp) => updateCardFollowUp(followUpCard.id, followUp)}
            />
          </div>
        ) : null}
      </dialog>

      <dialog
        ref={dialogRef}
        className="w-[min(100%,24rem)] rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-xl backdrop:bg-black/40"
        onCancel={(e) => {
          e.preventDefault();
          cancelClose();
        }}
      >
        {pendingClose ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmClose();
            }}
          >
            <h3 className="text-sm font-semibold">Encerrar oportunidade</h3>
            <p className="text-xs text-[var(--muted)]">
              Defina o resultado de {pendingClose.personName}. O cartão sairá do funil ativo, mas
              continuará disponível no histórico.
            </p>
            <label className="block space-y-1 text-xs font-medium">
              <span>Resultado</span>
              <select
                className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
                value={closingStageId}
                onChange={(e) => {
                  setClosingStageId(e.target.value);
                  setClosingReason("");
                }}
                disabled={closingBusy}
                autoFocus
              >
                {finalStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            {!finalStages
              .find((stage) => stage.id === closingStageId)
              ?.name.toLowerCase()
              .includes("convertido") ? (
              <label className="block space-y-1 text-xs font-medium">
                <span>Motivo</span>
                <select
                  className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
                  value={closingReason}
                  onChange={(e) => setClosingReason(e.target.value)}
                  disabled={closingBusy}
                >
                  <option value="">Selecione um motivo</option>
                  <option value="Sem interesse">Sem interesse</option>
                  <option value="Não responde">Não responde</option>
                  <option value="Região não atendida">Região não atendida</option>
                  <option value="Produto não disponível">Produto não disponível</option>
                  <option value="Já era cliente">Já era cliente</option>
                  <option value="Volume insuficiente">Volume insuficiente</option>
                  <option value="Preço">Preço</option>
                  <option value="Prazo">Prazo</option>
                  <option value="Outro">Outro</option>
                </select>
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => cancelClose()}
                disabled={closingBusy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--vp-gold)] disabled:opacity-50"
                disabled={closingBusy}
              >
                {closingBusy ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      {savingId ? (
        <p className="text-xs text-[var(--muted)]" aria-live="polite">
          Atualizando…
        </p>
      ) : null}

      {closedCards.length > 0 ? (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Encerrados nesta página ({closedCards.length})
          </summary>
          <ul className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-3">
            {closedCards.map((card) => {
              const stage = finalStages.find((item) => item.id === card.stage_id);
              return (
                <li
                  key={card.id}
                  className="rounded border border-[var(--border)] bg-[var(--background)] p-2"
                >
                  {card.lead_id ? (
                    <Link
                      href={`/leads/${card.lead_id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {card.personName}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{card.personName}</span>
                  )}
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {stage?.name ?? "Encerrado"}
                    {card.lost_reason ? ` · ${card.lost_reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </DndContext>
  );
}
