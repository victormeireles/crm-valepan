"use client";

import { deleteTask } from "@/app/actions/tasks";
import { toLocalDateKey, type CalendarEventDTO } from "@/lib/calendar-events";
import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarEventLinesDisplay } from "./calendar-event-display";

export function CalendarDayEventRow({
  ev,
  isSaving,
}: {
  ev: CalendarEventDTO;
  isSaving?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draggable = useDraggable({
    id: `task-panel:${ev.id}`,
    data: {
      type: "task",
      taskId: ev.id,
      dateKey: toLocalDateKey(ev.at),
      at: ev.at,
      title: ev.title,
      done: ev.done,
    },
  });

  const dragStyle = draggable.transform
    ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` }
    : undefined;

  async function onDelete() {
    if (!confirm(`Excluir a tarefa «${ev.title}»? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    setError(null);
    const res = await deleteTask(ev.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li
      ref={draggable.setNodeRef}
      style={dragStyle}
      className={`space-y-2 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm ${
        draggable.isDragging ? "opacity-40" : ""
      } ${isSaving ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          disabled={busy || isSaving}
          className="mt-0.5 shrink-0 cursor-grab touch-none px-0.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] active:cursor-grabbing disabled:opacity-50"
          aria-label={`Arrastar tarefa: ${ev.title}`}
          onClick={(e) => e.stopPropagation()}
          {...draggable.listeners}
          {...draggable.attributes}
        >
          ⠿
        </button>
        <div className={`min-w-0 flex-1 ${ev.done ? "opacity-80" : ""}`}>
          <CalendarEventLinesDisplay ev={ev} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ev.leadId ? (
            <Link href={ev.href} className="text-xs text-[var(--vp-wine)] hover:underline">
              Abrir lead
            </Link>
          ) : null}
          <button
            type="button"
            disabled={busy || isSaving}
            onClick={() => void onDelete()}
            className="text-xs text-[var(--vp-error)] hover:underline disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>

      {error ? <p className="text-xs text-[var(--vp-error)]">{error}</p> : null}
    </li>
  );
}
