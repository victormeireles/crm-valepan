"use client";

import { buildTaskCalendarEvent } from "@/lib/calendar-events";
import Link from "next/link";
import { CalendarEventLinesDisplay } from "./calendar-event-display";
import { DeleteTaskButton } from "./delete-task-button";
import { ToggleTaskButton } from "./toggle-task-button";

const actionBtn =
  "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1 text-xs font-medium hover:bg-[var(--background)] disabled:opacity-50";

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

  const dueLabel = dueAt ? new Date(dueAt).toLocaleDateString("pt-BR") : "Sem prazo";

  return (
    <li
      className={`rounded-lg border border-[var(--border)] bg-[var(--vp-paper-pure)] p-3 text-sm ${
        done ? "opacity-90" : ""
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className={`min-w-0 flex-1 ${done ? "opacity-90" : ""}`}>
          <CalendarEventLinesDisplay ev={ev} />
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:min-w-[11rem] sm:items-end">
          <span
            className={`self-start rounded-md px-2 py-0.5 text-xs tabular-nums sm:self-end ${
              done
                ? "bg-[rgba(35,0,4,0.05)] text-[var(--muted)]"
                : "bg-[rgba(35,0,4,0.08)] font-medium text-[var(--vp-wine)]"
            }`}
          >
            {dueLabel}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {leadId ? (
              <Link href={`/leads/${leadId}`} className={`${actionBtn} text-[var(--vp-wine)]`}>
                Lead
              </Link>
            ) : null}
            <ToggleTaskButton taskId={id} done={done} className={actionBtn} />
            <DeleteTaskButton taskId={id} title={title} className={actionBtn} />
          </div>
        </div>
      </div>
    </li>
  );
}
