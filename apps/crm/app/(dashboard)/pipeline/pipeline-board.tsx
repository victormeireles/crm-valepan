"use client";

import { updateOpportunityStage } from "@/app/actions/opportunity";
import { LeadIdentity } from "@/components/lead-identity";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  client_category: string | null;
  phone_e164: string | null;
  ownerId: string | null;
  signals: PipelineSignal[];
};

function stageNeedsLostReason(stageName: string) {
  const n = stageName.toLowerCase();
  return n.includes("perdido") || n.includes("sem interesse");
}

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
  if (!toList) return null;
  toList.unshift(updated);
  return next;
}

function DroppableColumn({
  stageId,
  stageName,
  count,
  children,
}: {
  stageId: string;
  stageName: string;
  count: number;
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
      className={`flex min-h-[min(62vh,26rem)] min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 sm:p-2 ${
        isOver ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--background)]" : ""
      }`}
    >
      <h2 className="line-clamp-3 text-center text-[10px] font-semibold leading-tight text-[var(--muted)] sm:text-[11px]">
        <span className="text-[var(--foreground)]">{stageName}</span>{" "}
        <span className="font-normal tabular-nums text-[var(--muted)]">({count})</span>
      </h2>
      <ul className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain sm:mt-2 sm:gap-1.5">
        {children}
      </ul>
    </section>
  );
}

function DraggableCard({
  card,
  stageId,
}: {
  card: PipelineCardDTO;
  stageId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `opp:${card.id}`,
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

  const body = (
    <LeadIdentity
      name={card.personName}
      companyName={card.companyLine}
      category={card.client_category}
      phoneTitle={card.phone_e164}
      size="sm"
      layout="stacked"
    />
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex gap-1 rounded border border-[var(--border)] bg-[var(--background)] px-1 py-1 sm:gap-1.5 sm:px-1.5 sm:py-1.5 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-grab touch-none px-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] active:cursor-grabbing sm:text-sm"
        aria-label={`Arrastar: ${card.personName}`}
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        {card.lead_id ? (
          <Link className="block hover:underline" href={`/leads/${card.lead_id}`}>
            {body}
          </Link>
        ) : (
          <div className="block">{body}</div>
        )}
        <PipelineSignalBadges signals={card.signals} />
        {card.lost_reason ? (
          <p className="mt-1 text-xs text-[var(--muted)]">Motivo: {card.lost_reason}</p>
        ) : null}
      </div>
    </li>
  );
}

function CardPreview({ card }: { card: PipelineCardDTO }) {
  return (
    <div className="pointer-events-none flex gap-2 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 shadow-lg">
      <span className="mt-0.5 shrink-0 text-[var(--muted)]">⠿</span>
      <div className="min-w-0 flex-1">
        <LeadIdentity
          name={card.personName}
          companyName={card.companyLine}
          category={card.client_category}
          phoneTitle={card.phone_e164}
          size="sm"
          layout="stacked"
        />
      </div>
    </div>
  );
}

export function PipelineBoard({
  stages,
  initialCards,
}: {
  stages: PipelineStageDTO[];
  initialCards: PipelineCardDTO[];
}) {
  const router = useRouter();

  const fingerprint = useMemo(
    () => initialCards.map((c) => `${c.id}:${c.stage_id}`).join("|"),
    [initialCards],
  );

  const [columns, setColumns] = useState(() => groupByStage(stages, initialCards));
  const [activeCard, setActiveCard] = useState<PipelineCardDTO | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{
    opportunityId: string;
    fromStageId: string;
    targetStageId: string;
    targetStageName: string;
  } | null>(null);
  const [lostDraft, setLostDraft] = useState("");
  const [lostBusy, setLostBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  useEffect(() => {
    const next = groupByStage(stages, initialCards);
    setColumns(next);
    columnsRef.current = next;
  }, [fingerprint, stages, initialCards]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (pendingLost) {
      setLostDraft("");
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [pendingLost]);

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
      setBannerError(null);
      setSavingId(opportunityId);
      const prev = cloneColumns(columnsRef.current);
      const optimistic = moveCard(columnsRef.current, opportunityId, fromStageId, toStageId);
      if (!optimistic) {
        setSavingId(null);
        return false;
      }
      setColumns(optimistic);
      columnsRef.current = optimistic;

      const res = await updateOpportunityStage({
        opportunityId,
        stageId: toStageId,
        lostReason,
      });

      setSavingId(null);
      if (!res.ok) {
        setColumns(prev);
        columnsRef.current = prev;
        setBannerError(res.error ?? "Não foi possível atualizar a etapa.");
        return false;
      }
      router.refresh();
      return true;
    },
    [router],
  );

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

      if (stageNeedsLostReason(targetStage.name)) {
        setPendingLost({
          opportunityId: activeData.opportunityId,
          fromStageId,
          targetStageId,
          targetStageName: targetStage.name,
        });
        return;
      }

      void commitMove(activeData.opportunityId, fromStageId, targetStageId, null);
    },
    [commitMove],
  );

  async function confirmLost() {
    if (!pendingLost) return;
    const trimmed = lostDraft.trim();
    if (!trimmed) {
      setBannerError("Informe o motivo.");
      return;
    }
    setLostBusy(true);
    setBannerError(null);
    const ok = await commitMove(
      pendingLost.opportunityId,
      pendingLost.fromStageId,
      pendingLost.targetStageId,
      trimmed,
    );
    setLostBusy(false);
    if (ok) setPendingLost(null);
  }

  function cancelLost() {
    setPendingLost(null);
    setLostDraft("");
    setBannerError(null);
  }

  return (
    <DndContext
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

      <div className="w-full min-w-0 overflow-x-auto pb-1 [scrollbar-gutter:stable]">
        <div
          className="grid w-full min-w-0 gap-1.5 sm:gap-2"
          style={
            stages.length > 0
              ? {
                  gridTemplateColumns: `repeat(${stages.length}, minmax(52px, 1fr))`,
                  width: `max(100%, ${stages.length * 52}px)`,
                }
              : undefined
          }
        >
          {stages.map((stage) => {
            const items = columns.get(stage.id) ?? [];
            return (
              <DroppableColumn key={stage.id} stageId={stage.id} stageName={stage.name} count={items.length}>
                {items.map((card) => (
                  <DraggableCard key={card.id} card={card} stageId={stage.id} />
                ))}
              </DroppableColumn>
            );
          })}
        </div>
      </div>

      <DragOverlay>{activeCard ? <CardPreview card={activeCard} /> : null}</DragOverlay>

      <dialog
        ref={dialogRef}
        className="w-[min(100%,24rem)] rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-xl backdrop:bg-black/40"
        onCancel={(e) => {
          e.preventDefault();
          cancelLost();
        }}
      >
        {pendingLost ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmLost();
            }}
          >
            <h3 className="text-sm font-semibold">Motivo — {pendingLost.targetStageName}</h3>
            <p className="text-xs text-[var(--muted)]">
              Esta etapa exige um motivo antes de mover a oportunidade.
            </p>
            <textarea
              className="min-h-[5rem] w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              value={lostDraft}
              onChange={(e) => setLostDraft(e.target.value)}
              placeholder="Descreva o motivo…"
              disabled={lostBusy}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => cancelLost()}
                disabled={lostBusy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--vp-gold)] disabled:opacity-50"
                disabled={lostBusy}
              >
                {lostBusy ? "Salvando…" : "Confirmar"}
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
    </DndContext>
  );
}
