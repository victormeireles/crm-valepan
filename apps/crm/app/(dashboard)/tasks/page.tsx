import { LeadIdentity } from "@/components/lead-identity";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { TaskForm } from "./task-form";
import { ToggleTaskButton } from "./toggle-task-button";

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: tasks } = await crm
    .from("tasks")
    .select(
      "id, title, due_at, done, lead_id, assignee_id, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
    )
    .order("due_at", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Tarefas</h1>
      <TaskForm />
      <ul className="space-y-2">
        {(tasks ?? []).map((t) => {
          type LeadN = {
            phone_e164: string;
            client_category?: string | null;
            contacts?:
              | { full_name: string | null }
              | { full_name: string | null }[]
              | null;
            companies?: { name: string | null } | { name: string | null }[] | null;
            distributors?: { name: string | null } | { name: string | null }[] | null;
          };
          const lead = nestOne(t.leads as LeadN | LeadN[] | null);
          const contact = nestOne(
            (lead?.contacts ?? null) as
              | { full_name: string | null }
              | { full_name: string | null }[]
              | null,
          );
          const company = nestOne(
            (lead?.companies ?? null) as
              | { name: string | null }
              | { name: string | null }[]
              | null,
          );
          const distributor = nestOne(
            (lead?.distributors ?? null) as
              | { name: string | null }
              | { name: string | null }[]
              | null,
          );
          const personName = lead ? displayPersonName(contact?.full_name) : "";
          const companyLine = lead
            ? displayCompanyName({
                companyName: company?.name,
                distributorName: distributor?.name,
                clientCategory: lead.client_category,
              })
            : null;
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            >
              <span className={t.done ? "text-[var(--muted)] line-through" : ""}>{t.title}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted)]">
                <span>
                  {t.due_at ? new Date(t.due_at).toLocaleString("pt-BR") : "sem prazo"}
                </span>
                {t.lead_id && lead ? (
                  <a
                    className="block max-w-[min(100%,280px)] text-[var(--accent)] hover:underline"
                    href={`/leads/${t.lead_id}`}
                  >
                    <LeadIdentity
                      name={personName}
                      companyName={companyLine}
                      category={lead.client_category}
                      phoneTitle={lead.phone_e164}
                      size="sm"
                      layout="inline"
                    />
                  </a>
                ) : t.lead_id ? (
                  <a className="text-[var(--accent)] hover:underline" href={`/leads/${t.lead_id}`}>
                    Abrir lead
                  </a>
                ) : null}
                <ToggleTaskButton taskId={t.id} done={t.done} />
              </div>
            </li>
          );
        })}
        {(!tasks || tasks.length === 0) && (
          <li className="text-sm text-[var(--muted)]">Nenhuma tarefa.</li>
        )}
      </ul>
    </div>
  );
}
