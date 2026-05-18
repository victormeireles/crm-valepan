"use client";

import {
  buildMonthGrid,
  formatMonthKey,
  groupEventsByDateKey,
  monthTitlePt,
  shiftMonthKey,
  toLocalDateKey,
  WEEKDAY_LABELS,
  type CalendarEventDTO,
} from "@/lib/calendar-events";
import Link from "next/link";
import { useMemo, useState } from "react";

const MAX_CHIPS_PER_DAY = 4;

export function TasksCalendar({
  taskEvents,
  followupEvents,
}: {
  taskEvents: CalendarEventDTO[];
  followupEvents: CalendarEventDTO[];
}) {
  const [monthKey, setMonthKey] = useState(() => formatMonthKey(new Date()));
  const [showFollowups, setShowFollowups] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const visibleEvents = useMemo(
    () => (showFollowups ? [...taskEvents, ...followupEvents] : taskEvents),
    [showFollowups, taskEvents, followupEvents],
  );

  const byDate = useMemo(() => groupEventsByDateKey(visibleEvents), [visibleEvents]);
  const grid = useMemo(() => buildMonthGrid(monthKey), [monthKey]);
  const todayKey = toLocalDateKey(new Date().toISOString());

  const selectedEvents = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  const monthTaskCount = taskEvents.filter((e) => toLocalDateKey(e.at).startsWith(monthKey)).length;
  const monthFollowupCount = followupEvents.filter((e) =>
    toLocalDateKey(e.at).startsWith(monthKey),
  ).length;

  return (
    <section className="space-y-4 rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--vp-wine)]">Calendário</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Prazos de tarefas
            {showFollowups ? " e próxima ação do funil" : ""} (fuso do navegador).
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={showFollowups}
            onChange={(e) => setShowFollowups(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          Próxima ação do funil ({followupEvents.length})
        </label>
      </div>

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
        {showFollowups ? (
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--vp-wine)] opacity-70" />
            Funil ({monthFollowupCount} neste mês)
          </span>
        ) : null}
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
          const isToday = cell.dateKey === todayKey;
          const isSelected = cell.dateKey === selectedDay;
          const inMonth = cell.dateKey.startsWith(monthKey);
          const overflow = events.length - MAX_CHIPS_PER_DAY;

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => setSelectedDay(cell.dateKey === selectedDay ? null : cell.dateKey)}
              className={`min-h-[4.5rem] bg-[var(--card)] p-1 text-left transition-colors hover:bg-[rgba(35,0,4,0.03)] ${
                isSelected ? "ring-2 ring-inset ring-[var(--vp-gold-classic)]" : ""
              } ${!inMonth ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums ${
                  isToday
                    ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                    : "text-[var(--foreground)]"
                }`}
              >
                {cell.day}
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {events.slice(0, MAX_CHIPS_PER_DAY).map((ev) => (
                  <li key={`${ev.kind}-${ev.id}`}>
                    <span
                      className={`block truncate rounded px-0.5 text-[10px] leading-tight ${
                        ev.kind === "followup"
                          ? "bg-[rgba(35,0,4,0.08)] text-[var(--vp-wine)]"
                          : ev.done
                            ? "bg-[var(--vp-surface-low)] text-[var(--muted)] line-through"
                            : "bg-[rgba(199,166,77,0.2)] text-[var(--vp-wine)]"
                      }`}
                      title={ev.title}
                    >
                      {ev.kind === "followup" ? "◎ " : ""}
                      {ev.title}
                    </span>
                  </li>
                ))}
                {overflow > 0 ? (
                  <li className="text-[10px] text-[var(--muted)]">+{overflow}</li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>

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
                <li key={`${ev.kind}-${ev.id}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className={ev.done ? "text-[var(--muted)] line-through" : ""}>
                    <span className="text-xs text-[var(--muted)]">
                      {ev.kind === "followup" ? "Funil · " : "Tarefa · "}
                      {new Date(ev.at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" — "}
                    </span>
                    {ev.title}
                  </span>
                  {ev.leadId ? (
                    <Link href={ev.href} className="text-xs text-[var(--vp-wine)] hover:underline">
                      Abrir lead
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
