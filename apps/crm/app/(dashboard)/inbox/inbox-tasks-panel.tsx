"use client";

import { LeadTaskForm } from "@/app/(dashboard)/leads/[id]/lead-task-form";
import { ToggleTaskButton } from "@/app/(dashboard)/tasks/toggle-task-button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type InboxTaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  assignee_id: string | null;
};

export function InboxTasksPanel({
  leadId,
  leadLabel,
  opportunityId,
  tasks,
  teamOptions,
  assigneeLabels,
  defaultAssigneeId,
}: {
  leadId: string;
  leadLabel: string;
  opportunityId: string | null;
  tasks: InboxTaskRow[];
  teamOptions: { id: string; label: string }[];
  assigneeLabels: Record<string, string>;
  defaultAssigneeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openCount = tasks.filter((t) => !t.done).length;
  const pending = tasks.filter((t) => !t.done);
  const doneRecent = tasks.filter((t) => t.done).slice(0, 5);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vp-wine)] transition-colors hover:bg-[rgba(35,0,4,0.05)]"
      >
        Tarefas
        {openCount > 0 ? (
          <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-[var(--vp-wine)] px-1.5 py-px text-[10px] font-bold text-[var(--vp-gold)] tabular-nums">
            {openCount}
          </span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(100%,28rem)] max-h-[min(90dvh,640px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-0 shadow-[var(--sh-lg)] backdrop:bg-black/40"
        onClose={() => setOpen(false)}
      >
        <div className="flex max-h-[min(90dvh,640px)] flex-col">
          <header className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--vp-wine)]">Tarefas do lead</h2>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={leadLabel}>
                {leadLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[rgba(35,0,4,0.06)]"
            >
              Fechar
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ul className="space-y-2">
              {pending.length === 0 ? (
                <li className="text-sm text-[var(--muted)]">Nenhuma tarefa em aberto.</li>
              ) : (
                pending.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2 text-sm last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--foreground)]">{t.title}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {t.due_at
                          ? new Date(t.due_at).toLocaleString("pt-BR")
                          : "Sem prazo"}
                        {t.assignee_id
                          ? ` · ${assigneeLabels[t.assignee_id] ?? "Responsável"}`
                          : ""}
                      </span>
                    </div>
                    <ToggleTaskButton taskId={t.id} done={false} />
                  </li>
                ))
              )}
            </ul>

            {doneRecent.length > 0 ? (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="mb-2 text-xs font-medium text-[var(--muted)]">Concluídas recentemente</p>
                <ul className="space-y-1.5">
                  {doneRecent.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-[var(--muted)] line-through">{t.title}</span>
                      <ToggleTaskButton taskId={t.id} done />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">Próxima tarefa</h3>
              <LeadTaskForm
                key={`inbox-task-${leadId}`}
                leadId={leadId}
                opportunityId={opportunityId}
                teamOptions={teamOptions}
                defaultAssigneeId={defaultAssigneeId}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                A tarefa aparece na ficha do lead, em Tarefas e, com prazo, na próxima ação do funil.
              </p>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--border)] px-4 py-2">
            <Link
              href={`/leads/${leadId}`}
              className="text-xs font-medium text-[var(--vp-wine)] hover:underline"
              onClick={() => setOpen(false)}
            >
              Abrir ficha do lead →
            </Link>
          </footer>
        </div>
      </dialog>
    </>
  );
}
