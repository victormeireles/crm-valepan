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

const CARDS_PER_PAGE = 20;

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
  distributor_id: string | null;
  network_type: string | null;
  phone_e164: string | null;
  ownerId: string | null;
  signals: PipelineSignal[];
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

function normalizeColumnSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function cardMatchesColumnSearch(card: PipelineCardDTO, query: string) {
  const normalizedQuery = normalizeColumnSearch(query);
  if (!normalizedQuery) return true;

  const textQueryMatches = normalizeColumnSearch(card.personName).includes(normalizedQuery);
  const queryDigits = query.replace(/\D/g, "");
  const phoneDigits = card.phone_e164?.replace(/\D/g, "") ?? "";
  const phoneQueryMatches = queryDigits.length > 0 && phoneDigits.includes(queryDigits);

  return textQueryMatches || phoneQueryMatches;
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

function DroppableColumn({
  stageId,
  stageName,
  count,
  totalCount,
  searchValue,
  onSearchChange,
  children,
}: {
  stageId: string;
  stageName: string;
  count: number;
  totalCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
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
      className={`flex h-[min(62vh,26rem)] min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 sm:p-2 ${
        isOver ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--background)]" : ""
      }`}
    >
      <h2 className="line-clamp-3 text-center text-[10px] font-semibold leading-tight text-[var(--muted)] sm:text-[11px]">
        <span className="text-[var(--foreground)]">{stageName}</span>{" "}
        <span className="font-normal tabular-nums text-[var(--muted)]">
          ({searchValue.trim() ? `${count}/${totalCount}` : count})
        </span>
      </h2>
      <label className="mt-1.5 block">
        <span className="sr-only">Filtrar {stageName} por nome ou telefone</span>
        <input
          type="search"
          value={searchValue}
          placeholder="Nome ou telefone"
          aria-label={`Filtrar ${stageName} por nome ou telefone`}
          className="w-full min-w-0 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)]"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <ul className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain sm:mt-2 sm:gap-1.5">
        {children}
      </ul>
    </section>
  );
}

function DraggableCard({
  card,
  stageId,
  onClose,
}: {
  card: PipelineCardDTO;
  stageId: string;
  onClose: (card: PipelineCardDTO, stageId: string) => void;
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
      phone={card.phone_e164}
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
        <button
          type="button"
          className="mt-2 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          onClick={() => onClose(card, stageId)}
        >
          Encerrar
        </button>
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
          phone={card.phone_e164}
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
  const activeStages = useMemo(() => stages.filter((stage) => !stage.is_final), [stages]);
  const finalStages = useMemo(() => stages.filter((stage) => stage.is_final), [stages]);
  const closedCards = useMemo(
    () => initialCards.filter((card) => finalStages.some((stage) => stage.id === card.stage_id)),
    [finalStages, initialCards],
  );

  const fingerprint = useMemo(
    () => initialCards.map((c) => `${c.id}:${c.stage_id}`).join("|"),
    [initialCards],
  );

  const [columns, setColumns] = useState(() => groupByStage(activeStages, initialCards));
  const [visibleCardsByStage, setVisibleCardsByStage] = useState<Record<string, number>>({});
  const [searchByStage, setSearchByStage] = useState<Record<string, string>>({});
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  useEffect(() => {
    const next = groupByStage(activeStages, initialCards);
    setColumns(next);
    columnsRef.current = next;
    setVisibleCardsByStage({});
  }, [fingerprint, activeStages, initialCards]);

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
      setBannerSuccess(null);
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
      if (res.tasksCreated > 0) {
        const n = res.tasksCreated;
        setBannerSuccess(
          n === 1
            ? "1 tarefa automática criada para esta etapa."
            : `${n} tarefas automáticas criadas para esta etapa.`,
        );
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
          className="grid w-full min-w-0 gap-1.5 sm:gap-2"
          style={
            activeStages.length > 0
              ? {
                  gridTemplateColumns: `repeat(${activeStages.length}, minmax(13rem, 1fr))`,
                  width: `max(100%, ${activeStages.length * 208}px)`,
                }
              : undefined
          }
        >
          {activeStages.map((stage) => {
            const items = columns.get(stage.id) ?? [];
            const stageSearch = searchByStage[stage.id] ?? "";
            const filteredItems = items.filter((card) => cardMatchesColumnSearch(card, stageSearch));
            const visibleLimit = visibleCardsByStage[stage.id] ?? CARDS_PER_PAGE;
            const visibleItems = filteredItems.slice(0, visibleLimit);
            const hasMore = visibleItems.length < filteredItems.length;
            const canHide = visibleLimit > CARDS_PER_PAGE;
            return (
              <DroppableColumn
                key={stage.id}
                stageId={stage.id}
                stageName={stage.name}
                count={filteredItems.length}
                totalCount={items.length}
                searchValue={stageSearch}
                onSearchChange={(value) => {
                  setSearchByStage((current) => ({ ...current, [stage.id]: value }));
                  setVisibleCardsByStage((current) => ({
                    ...current,
                    [stage.id]: CARDS_PER_PAGE,
                  }));
                }}
              >
                {visibleItems.map((card) => (
                  <DraggableCard
                    key={card.id}
                    card={card}
                    stageId={stage.id}
                    onClose={(selectedCard, fromStageId) =>
                      setPendingClose({
                        opportunityId: selectedCard.id,
                        fromStageId,
                        personName: selectedCard.personName,
                      })
                    }
                  />
                ))}
                {stageSearch.trim() && filteredItems.length === 0 ? (
                  <li className="px-2 py-4 text-center text-xs text-[var(--muted)]">
                    Nenhum contato encontrado.
                  </li>
                ) : null}
                {filteredItems.length > CARDS_PER_PAGE ? (
                  <li className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-center gap-1.5 border-t border-[var(--border)] bg-[var(--card)] px-1 py-2">
                    {hasMore ? (
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--accent)]"
                        onClick={() =>
                          setVisibleCardsByStage((current) => ({
                            ...current,
                            [stage.id]: visibleLimit + CARDS_PER_PAGE,
                          }))
                        }
                      >
                        Ver mais
                      </button>
                    ) : null}
                    {canHide ? (
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                        onClick={() =>
                          setVisibleCardsByStage((current) => ({
                            ...current,
                            [stage.id]: CARDS_PER_PAGE,
                          }))
                        }
                      >
                        Ocultar
                      </button>
                    ) : null}
                    <span className="basis-full text-center text-[10px] tabular-nums text-[var(--muted)]">
                      Exibindo {visibleItems.length} de {filteredItems.length}
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
