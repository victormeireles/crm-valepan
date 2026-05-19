"use client";

import { updateTaskDueAt } from "@/app/actions/tasks";
import {
  buildMonthGrid,
  calendarEventTooltip,
  formatMonthKey,
  groupEventsByDateKey,
  mergeLocalDateWithTime,
  monthTitlePt,
  shiftMonthKey,
  toLocalDateKey,
  WEEKDAY_LABELS,
  type CalendarEventDTO,
} from "@/lib/calendar-events";
import { CalendarEventLinesDisplay } from "./calendar-event-display";
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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDayEventRow } from "./calendar-day-event-row";

const MAX_CHIPS_PER_DAY = 4;

type TaskDragData = {
  type: "task";
  taskId: string;
  dateKey: string;
  at: string;
  title: string;
  done?: boolean;
};

function CalendarEventChip({
  ev,
  compact,
  draggable,
}: {
  ev: CalendarEventDTO;
  compact?: boolean;
  draggable?: boolean;
}) {
  const textSize = compact ? "text-[10px]" : "text-xs";
  const className = `rounded px-0.5 ${textSize} ${taskChipClass(ev)}`;
  const inner = (
    <CalendarEventLinesDisplay
      ev={ev}
      compact={compact}
      showFunnelMark={false}
    />
  );

  if (draggable) {
    return <div className={className}>{inner}</div>;
  }

  return <span className={`block ${className}`}>{inner}</span>;
}

function taskChipClass(ev: Pick<CalendarEventDTO, "kind" | "done">) {
  if (ev.kind === "followup") {
    return "bg-[rgba(35,0,4,0.08)] text-[var(--vp-wine)]";
  }
  if (ev.done) {
    return "bg-[var(--vp-surface-low)] text-[var(--muted)] line-through";
  }
  return "bg-[rgba(199,166,77,0.2)] text-[var(--vp-wine)]";
}

function DraggableTaskChip({
  ev,
  compact,
}: {
  ev: CalendarEventDTO;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-chip:${ev.id}`,
    data: {
      type: "task",
      taskId: ev.id,
      dateKey: toLocalDateKey(ev.at),
      at: ev.at,
      title: ev.title,
      done: ev.done,
    } satisfies TaskDragData,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      title={`${calendarEventTooltip(ev)} — arraste para outro dia`}
      className={`cursor-grab touch-none active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
      onClick={(e) => e.stopPropagation()}
      {...listeners}
      {...attributes}
    >
      <CalendarEventChip ev={ev} compact={compact} draggable />
    </div>
  );
}

function TaskChipPreview({ ev }: { ev: CalendarEventDTO }) {
  return (
    <div
      className={`pointer-events-none max-w-[10rem] rounded px-1.5 py-0.5 text-xs shadow-lg ${taskChipClass(ev)}`}
    >
      <CalendarEventLinesDisplay ev={ev} compact />
    </div>
  );
}

function DroppableDayCell({
  dateKey,
  day,
  events,
  isToday,
  isSelected,
  inMonth,
  onSelect,
}: {
  dateKey: string;
  day: number;
  events: CalendarEventDTO[];
  isToday: boolean;
  isSelected: boolean;
  inMonth: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${dateKey}`,
    data: { type: "day" as const, dateKey },
  });

  const overflow = events.length - MAX_CHIPS_PER_DAY;

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`min-h-[4.5rem] cursor-pointer bg-[var(--card)] p-1 text-left transition-colors hover:bg-[rgba(35,0,4,0.03)] ${
        isSelected ? "ring-2 ring-inset ring-[var(--vp-gold-classic)]" : ""
      } ${isOver ? "bg-[rgba(199,166,77,0.12)] ring-2 ring-inset ring-[var(--vp-gold-classic)]" : ""} ${
        !inMonth ? "opacity-50" : ""
      }`}
    >
      <span
        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums ${
          isToday ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]" : "text-[var(--foreground)]"
        }`}
      >
        {day}
      </span>
      <ul className="mt-0.5 space-y-0.5">
        {events.slice(0, MAX_CHIPS_PER_DAY).map((ev) => (
          <li key={ev.id}>
            <DraggableTaskChip ev={ev} compact />
          </li>
        ))}
        {overflow > 0 ? <li className="text-[10px] text-[var(--muted)]">+{overflow}</li> : null}
      </ul>
    </div>
  );
}

export function TasksCalendar({ taskEvents }: { taskEvents: CalendarEventDTO[] }) {
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(() => formatMonthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState(taskEvents);
  const [activeDragEvent, setActiveDragEvent] = useState<CalendarEventDTO | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const taskFingerprint = useMemo(
    () => taskEvents.map((e) => `${e.id}:${e.at}:${e.done}`).join("|"),
    [taskEvents],
  );

  useEffect(() => {
    setLocalTasks(taskEvents);
  }, [taskFingerprint, taskEvents]);

  const localTasksRef = useRef(localTasks);
  localTasksRef.current = localTasks;

  const byDate = useMemo(() => groupEventsByDateKey(localTasks), [localTasks]);
  const grid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const todayKey = toLocalDateKey(new Date().toISOString());

  const selectedEvents = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  const monthTaskCount = localTasks.filter((e) => toLocalDateKey(e.at).startsWith(monthKey)).length;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const commitMove = useCallback(
    async (taskId: string, fromDateKey: string, toDateKey: string) => {
      if (fromDateKey === toDateKey) return true;

      const task = localTasksRef.current.find((t) => t.id === taskId);
      if (!task) return false;

      const newDueAtIso = mergeLocalDateWithTime(task.at, toDateKey);
      const snapshot = localTasksRef.current;

      setSavingTaskId(taskId);
      setBannerError(null);
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, at: newDueAtIso } : t)),
      );

      const res = await updateTaskDueAt(taskId, newDueAtIso);
      setSavingTaskId(null);

      if (!res.ok) {
        setLocalTasks(snapshot);
        setBannerError(res.error);
        return false;
      }

      router.refresh();
      return true;
    },
    [router],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as TaskDragData | undefined;
    if (data?.type !== "task") return;
    const ev = localTasksRef.current.find((t) => t.id === data.taskId) ?? null;
    setActiveDragEvent(ev);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragEvent(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as TaskDragData | undefined;
      if (activeData?.type !== "task") return;

      const overData = over.data.current as { type?: string; dateKey?: string } | undefined;
      if (overData?.type !== "day" || !overData.dateKey) return;

      void commitMove(activeData.taskId, activeData.dateKey, overData.dateKey);
    },
    [commitMove],
  );

  return (
    <section className="space-y-4 rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)]">
      <div>
        <h2 className="text-sm font-semibold text-[var(--vp-wine)]">Calendário</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Arraste tarefas para outro dia (fuso do navegador).
        </p>
      </div>

      {bannerError ? (
        <p className="rounded border border-[var(--vp-error)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--vp-error)]">
          {bannerError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setMonthKey((k) => shiftMonthKey(k, -1));
            setSelectedDay(null);
          }}
          className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[rgba(35,0,4,0.04)]"
          aria-label="Mês anterior"
        >
          ←
        </button>
        <p className="text-sm font-medium capitalize text-[var(--vp-wine)]">{monthTitlePt(monthKey)}</p>
        <button
          type="button"
          onClick={() => {
            setMonthKey((k) => shiftMonthKey(k, 1));
            setSelectedDay(null);
          }}
          className="rounded border border-[var(--border)] px-2 py-1 text-sm hover:bg-[rgba(35,0,4,0.04)]"
          aria-label="Próximo mês"
        >
          →
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--vp-gold-classic)]" />
          Tarefa ({monthTaskCount} neste mês)
        </span>
        <button
          type="button"
          className="text-[var(--vp-wine)] underline-offset-2 hover:underline"
          onClick={() => {
            setMonthKey(formatMonthKey(new Date()));
            setSelectedDay(todayKey);
          }}
        >
          Ir para hoje
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
          {WEEKDAY_LABELS.map((wd) => (
            <div
              key={wd}
              className="bg-[var(--vp-surface-low)] px-1 py-1.5 text-center text-[10px] font-semibold uppercase text-[var(--muted)]"
            >
              {wd}
            </div>
          ))}
          {grid.map((cell, idx) => {
            if (!cell.dateKey || cell.day === null) {
              return <div key={`empty-${idx}`} className="min-h-[4.5rem] bg-[var(--card)]" />;
            }
            const events = byDate.get(cell.dateKey) ?? [];

            return (
              <DroppableDayCell
                key={cell.dateKey}
                dateKey={cell.dateKey}
                day={cell.day}
                events={events}
                isToday={cell.dateKey === todayKey}
                isSelected={cell.dateKey === selectedDay}
                inMonth={cell.dateKey.startsWith(monthKey)}
                onSelect={() =>
                  setSelectedDay(cell.dateKey === selectedDay ? null : cell.dateKey)
                }
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeDragEvent ? <TaskChipPreview ev={activeDragEvent} /> : null}
        </DragOverlay>

        {selectedDay ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <h3 className="text-xs font-semibold text-[var(--muted)]">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Nada agendado neste dia.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectedEvents.map((ev) => (
                  <CalendarDayEventRow
                    key={ev.id}
                    ev={ev}
                    isSaving={savingTaskId === ev.id}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </DndContext>
    </section>
  );
}
