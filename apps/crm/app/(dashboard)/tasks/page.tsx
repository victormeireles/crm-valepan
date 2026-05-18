import { LeadIdentity } from "@/components/lead-identity";
import type { CalendarEventDTO } from "@/lib/calendar-events";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { TaskForm } from "./task-form";
import { TasksCalendar } from "./tasks-calendar";
import { ToggleTaskButton } from "./toggle-task-button";

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

  const [{ data: tasks }, { data: followupRows }, { data: stages }] = await Promise.all([
    crm
      .from("tasks")
      .select(
        "id, title, due_at, done, lead_id, assignee_id, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
      )
      .order("due_at", { ascending: true, nullsFirst: false }),
    crm
      .from("opportunities")
      .select(
        "id, title, next_action_at, lead_id, stage_id, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
      )
      .not("next_action_at", "is", null)
      .order("next_action_at", { ascending: true }),
    crm.from("pipeline_stages").select("id, is_final"),
  ]);

  const finalStageIds = new Set((stages ?? []).filter((s) => s.is_final).map((s) => s.id));

  const taskEvents: CalendarEventDTO[] = (tasks ?? [])
    .filter((t) => t.due_at)
    .map((t) => {
      return {
        id: t.id,
        kind: "task" as const,
        at: t.due_at!,
        title: t.title,
        done: t.done,
        leadId: t.lead_id,
        href: t.lead_id ? `/leads/${t.lead_id}` : "/tasks",
      };
    });

  const followupEvents: CalendarEventDTO[] = (followupRows ?? [])
    .filter((o) => o.next_action_at && !finalStageIds.has(o.stage_id))
    .map((o) => {
      const { personName } = leadDisplay(nestOne(o.leads as LeadN | LeadN[] | null));
      const oppTitle = (o.title ?? "").trim();
      const label =
        oppTitle.length > 0
          ? oppTitle
          : personName.length > 0
            ? `Follow-up · ${personName}`
            : "Próxima ação do funil";
      return {
        id: o.id,
        kind: "followup" as const,
        at: o.next_action_at!,
        title: label,
        leadId: o.lead_id,
        href: o.lead_id ? `/leads/${o.lead_id}` : "/pipeline",
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Tarefas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Calendário com prazos e follow-ups do funil; lista completa abaixo.
        </p>
      </div>
      <TaskForm />
      <TasksCalendar taskEvents={taskEvents} followupEvents={followupEvents} />
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--vp-wine)]">Todas as tarefas</h2>
        <ul className="space-y-2">
          {(tasks ?? []).map((t) => {
            const lead = nestOne(t.leads as LeadN | LeadN[] | null);
            const { personName, companyLine } = leadDisplay(lead);
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
      </section>
    </div>
  );
}
