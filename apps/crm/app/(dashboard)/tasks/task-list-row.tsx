"use client";

import { buildTaskCalendarEvent } from "@/lib/calendar-events";
import Link from "next/link";
import { CalendarEventLinesDisplay } from "./calendar-event-display";
import { ToggleTaskButton } from "./toggle-task-button";

export function TaskListRow({
  id,
  title,
  dueAt,
  done,
  leadId,
  leadName,
  companyName,
}: {
  id: string;
  title: string;
  dueAt: string | null;
  done: boolean;
  leadId: string | null;
  leadName: string | null;
  companyName: string | null;
}) {
  const ev = buildTaskCalendarEvent({
    id,
    title,
    at: dueAt ?? new Date(0).toISOString(),
    done,
    leadId,
    leadName,
    companyName,
  });

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
      <div className={`min-w-0 flex-1 ${done ? "opacity-80" : ""}`}>
        <CalendarEventLinesDisplay ev={ev} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted)]">
        <span className="whitespace-nowrap tabular-nums">
          {dueAt ? new Date(dueAt).toLocaleDateString("pt-BR") : "sem prazo"}
        </span>
        {leadId ? (
          <Link href={`/leads/${leadId}`} className="text-[var(--vp-wine)] hover:underline">
            Abrir lead
          </Link>
        ) : null}
        <ToggleTaskButton taskId={id} done={done} />
      </div>
    </li>
  );
}
