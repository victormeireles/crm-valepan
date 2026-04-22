import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { TaskForm } from "./task-form";
import { ToggleTaskButton } from "./toggle-task-button";

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: tasks } = await crm
    .from("tasks")
    .select("id, title, due_at, done, lead_id, assignee_id")
    .order("due_at", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Tarefas</h1>
      <TaskForm />
      <ul className="space-y-2">
        {(tasks ?? []).map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            <span className={t.done ? "text-[var(--muted)] line-through" : ""}>{t.title}</span>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>
                {t.due_at ? new Date(t.due_at).toLocaleString("pt-BR") : "sem prazo"}
                {t.lead_id ? (
                  <a className="ml-2 text-[var(--accent)]" href={`/leads/${t.lead_id}`}>
                    ver lead
                  </a>
                ) : null}
              </span>
              <ToggleTaskButton taskId={t.id} done={t.done} />
            </div>
          </li>
        ))}
        {(!tasks || tasks.length === 0) && (
          <li className="text-sm text-[var(--muted)]">Nenhuma tarefa.</li>
        )}
      </ul>
    </div>
  );
}
