import type { CalendarEventDTO } from "@/lib/calendar-events";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { TaskForm } from "./task-form";
import { TaskListRow } from "./task-list-row";
import { TasksCalendar } from "./tasks-calendar";

type LeadN = {
  phone_e164: string;
  client_category?: string | null;
  contacts?: { full_name: string | null } | { full_name: string | null }[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
  distributors?: { name: string | null } | { name: string | null }[] | null;
};

function leadDisplay(lead: LeadN | null) {
  if (!lead) return { personName: "", companyLine: null as string | null, lead: null };
  const contact = nestOne(
    (lead.contacts ?? null) as
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null,
  );
  const company = nestOne(
    (lead.companies ?? null) as { name: string | null } | { name: string | null }[] | null,
  );
  const distributor = nestOne(
    (lead.distributors ?? null) as { name: string | null } | { name: string | null }[] | null,
  );
  return {
    personName: displayPersonName(contact?.full_name),
    companyLine: displayCompanyName({
      companyName: company?.name,
      distributorName: distributor?.name,
      clientCategory: lead.client_category,
    }),
    lead,
  };
}

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: tasks } = await crm
    .from("tasks")
    .select(
      "id, title, due_at, done, lead_id, assignee_id, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
    )
    .order("due_at", { ascending: true, nullsFirst: false });

  const taskEvents: CalendarEventDTO[] = (tasks ?? [])
    .filter((t) => t.due_at)
    .map((t) => {
      const { personName, companyLine } = leadDisplay(nestOne(t.leads as LeadN | LeadN[] | null));
      return {
        id: t.id,
        kind: "task" as const,
        at: t.due_at!,
        title: t.title,
        leadName: t.lead_id ? personName : null,
        companyName: t.lead_id ? companyLine : null,
        done: t.done,
        leadId: t.lead_id,
        href: t.lead_id ? `/leads/${t.lead_id}` : "/tasks",
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Tarefas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Calendário com prazos das tarefas; lista completa abaixo.
        </p>
      </div>
      <TaskForm />
      <TasksCalendar taskEvents={taskEvents} />
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--vp-wine)]">Todas as tarefas</h2>
        <ul className="space-y-2">
          {(tasks ?? []).map((t) => {
            const { personName, companyLine } = leadDisplay(
              nestOne(t.leads as LeadN | LeadN[] | null),
            );
            return (
              <TaskListRow
                key={t.id}
                id={t.id}
                title={t.title}
                dueAt={t.due_at}
                done={t.done}
                leadId={t.lead_id}
                leadName={t.lead_id ? personName : null}
                companyName={t.lead_id ? companyLine : null}
              />
            );
          })}
          {(!tasks || tasks.length === 0) && (
            <li className="text-sm text-[var(--muted)]">Nenhuma tarefa.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
