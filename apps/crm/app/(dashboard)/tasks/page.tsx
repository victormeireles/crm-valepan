import type { CalendarEventDTO } from "@/lib/calendar-events";
import { taskRowMatchesQuery } from "@/lib/crm-text-search";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { Suspense } from "react";
import { TaskForm } from "./task-form";
import { TaskListRow } from "./task-list-row";
import { TasksCalendar } from "./tasks-calendar";
import { TasksFilters } from "./tasks-filters";

export const dynamic = "force-dynamic";

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

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
  lead_id: string | null;
  leads: LeadN | LeadN[] | null;
};

function compareOpenTasks(a: TaskRow, b: TaskRow) {
  if (!a.due_at && !b.due_at) return a.title.localeCompare(b.title, "pt-BR");
  if (!a.due_at) return 1;
  if (!b.due_at) return -1;
  const byDue = a.due_at.localeCompare(b.due_at);
  return byDue !== 0 ? byDue : a.title.localeCompare(b.title, "pt-BR");
}

function compareDoneTasks(a: TaskRow, b: TaskRow) {
  const aDue = a.due_at ?? "";
  const bDue = b.due_at ?? "";
  const byDue = bDue.localeCompare(aDue);
  return byDue !== 0 ? byDue : a.title.localeCompare(b.title, "pt-BR");
}

function renderTaskRow(t: TaskRow) {
  const { personName, companyLine } = leadDisplay(nestOne(t.leads));
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
}

function taskSearchFields(t: TaskRow) {
  const lead = nestOne(t.leads);
  const { personName, companyLine } = leadDisplay(lead);
  return {
    title: t.title,
    personName,
    companyLine,
    phoneE164: lead?.phone_e164 ?? null,
  };
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const query = typeof sp.q === "string" ? sp.q : "";

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

  const allTasks = (tasks ?? []) as TaskRow[];
  const matchesQuery = (t: TaskRow) =>
    query.trim().length === 0 || taskRowMatchesQuery(taskSearchFields(t), query);

  const openAll = allTasks.filter((t) => !t.done);
  const doneAll = allTasks.filter((t) => t.done);
  const openTasks = openAll.filter(matchesQuery).sort(compareOpenTasks);
  const doneTasks = doneAll.filter(matchesQuery).sort(compareDoneTasks);

  const phoneByTaskId = new Map(
    allTasks.map((t) => [t.id, nestOne(t.leads)?.phone_e164 ?? null] as const),
  );
  const filteredTaskEvents =
    query.trim().length === 0
      ? taskEvents
      : taskEvents.filter((ev) =>
          taskRowMatchesQuery(
            {
              title: ev.title,
              personName: ev.leadName ?? "",
              companyLine: ev.companyName,
              phoneE164: phoneByTaskId.get(ev.id) ?? null,
            },
            query,
          ),
        );

  const sectionCountLabel = (visible: number, total: number) =>
    query.trim().length > 0 && visible !== total ? `${visible} de ${total}` : String(visible);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Tarefas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Calendário com prazos; busca e listas em aberto e concluídas abaixo.
        </p>
      </div>
      <TaskForm />
      <TasksCalendar taskEvents={filteredTaskEvents} />

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold text-[var(--vp-wine)]">Listas de tarefas</h2>
        </div>

        <Suspense fallback={<p className="px-3 py-2 text-sm text-[var(--muted)]">Carregando…</p>}>
          <TasksFilters
            totalCount={allTasks.length}
            visibleCount={openTasks.length + doneTasks.length}
            openVisible={openTasks.length}
            openTotal={openAll.length}
            doneVisible={doneTasks.length}
            doneTotal={doneAll.length}
          />
        </Suspense>

        {allTasks.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">Nenhuma tarefa cadastrada.</p>
        ) : (
          <>
            <div>
              <div className="border-b border-[var(--border)] bg-[rgba(35,0,4,0.04)] px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-wine)]">
                  Em aberto
                  <span className="ml-2 font-normal normal-case tracking-normal text-[var(--muted)]">
                    ({sectionCountLabel(openTasks.length, openAll.length)})
                  </span>
                </h3>
              </div>
              {openTasks.length > 0 ? (
                <ul className="space-y-2 p-3">{openTasks.map(renderTaskRow)}</ul>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  {query.trim().length > 0
                    ? `Nenhuma tarefa em aberto para «${query.trim()}».`
                    : "Nenhuma tarefa em aberto."}
                </p>
              )}
            </div>

            <div className="border-t border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[rgba(35,0,4,0.02)] px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                  Concluídas
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    ({sectionCountLabel(doneTasks.length, doneAll.length)})
                  </span>
                </h3>
              </div>
              {doneTasks.length > 0 ? (
                <ul className="space-y-2 p-3">{doneTasks.map(renderTaskRow)}</ul>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  {query.trim().length > 0
                    ? `Nenhuma tarefa concluída para «${query.trim()}».`
                    : "Nenhuma tarefa concluída ainda."}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
