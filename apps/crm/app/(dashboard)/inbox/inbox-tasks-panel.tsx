"use client";

import { LeadTaskForm } from "@/app/(dashboard)/leads/[id]/lead-task-form";
import { ToggleTaskButton } from "@/app/(dashboard)/tasks/toggle-task-button";
import { useState } from "react";

export type InboxTaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  assignee_id: string | null;
};

export function InboxTasksPanel({
  leadId,
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
  const [createdTitle, setCreatedTitle] = useState<string | null>(null);
  const pending = tasks.filter((task) => !task.done);

  return (
    <section>
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">Tarefas</p>
      <ul className="space-y-1.5">
        {pending.length === 0 ? (
          <li className="text-xs text-[var(--vp-ink-muted)]">Nenhuma tarefa em aberto.</li>
        ) : pending.map((task) => (
          <li key={task.id} className="flex items-center gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] px-2.5 py-2">
            <ToggleTaskButton
              taskId={task.id}
              done={false}
              iconOnly
              className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--vp-ink-soft)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--vp-ink-body)]">{task.title}</span>
              <span className="block text-[11px] text-[var(--vp-ink-muted)]">
                {task.due_at ? new Date(task.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem prazo"}
                {task.assignee_id ? ` · ${assigneeLabels[task.assignee_id] ?? "Responsável"}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-2 rounded-[10px] border border-dashed border-[var(--vp-ink-line)]">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-bold text-[var(--vp-wine)] marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="material-symbols-outlined text-base" aria-hidden="true">add_task</span>
          Nova tarefa
        </summary>
        <div className="border-t border-[var(--vp-ink-line)] p-3">
          {createdTitle ? <p className="mb-2 text-xs text-[var(--vp-wine)]" aria-live="polite">Tarefa criada: {createdTitle}</p> : null}
          <LeadTaskForm
            key={`inbox-task-${leadId}`}
            leadId={leadId}
            opportunityId={opportunityId}
            teamOptions={teamOptions}
            defaultAssigneeId={defaultAssigneeId}
            onCreated={setCreatedTitle}
          />
        </div>
      </details>
    </section>
  );
}
