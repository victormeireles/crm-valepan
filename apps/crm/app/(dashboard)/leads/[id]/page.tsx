import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadNoteForm } from "./lead-note-form";
import { LeadTaskForm } from "./lead-task-form";
import { TimelineEntry } from "./timeline-entry";
import { ToggleTaskButton } from "../../tasks/toggle-task-button";
import { LeadActions } from "./ui";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: lead } = await crm
    .from("leads")
    .select(
      "*, companies(id, name, city, state, document), contacts(id, full_name, email, phone_e164), distributors(id, name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const company = lead.companies as
    | { id: string; name: string; city: string | null; state: string | null; document: string | null }
    | null;
  const contact = lead.contacts as
    | { id: string; full_name: string | null; email: string | null; phone_e164: string }
    | null;
  const distributor = lead.distributors as { id: string; name: string } | null;

  const displayName = (contact?.full_name ?? "").trim();
  const heading = displayName.length > 0 ? displayName : lead.phone_e164;

  const { data: opps } = await crm
    .from("opportunities")
    .select("*, pipeline_stages(name)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  const opportunity = opps?.[0] ?? null;

  const { data: stages } = await crm
    .from("pipeline_stages")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const { data: timeline } = await crm
    .from("timeline_events")
    .select("*")
    .eq("lead_id", id)
    .order("at", { ascending: false })
    .limit(80);

  const { data: leadTasks } = await crm
    .from("tasks")
    .select("id, title, due_at, done")
    .eq("lead_id", id)
    .order("due_at", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/leads" className="text-sm text-[var(--muted)] hover:underline">
            ← Leads
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{heading}</h1>
          {displayName.length > 0 ? (
            <p className="text-sm text-[var(--muted)]">{lead.phone_e164}</p>
          ) : null}
          <p className="text-sm text-[var(--muted)]">
            Status: {lead.status} · Origem: {lead.source}
          </p>
        </div>
        <LeadActions
          key={opportunity?.id ?? "no-opp"}
          leadId={id}
          clientCategory={lead.client_category ?? null}
          distributorName={(distributor?.name ?? "").trim().toUpperCase()}
          contact={
            contact
              ? {
                  id: contact.id,
                  full_name: contact.full_name,
                }
              : null
          }
          opportunity={
            opportunity
              ? {
                  id: opportunity.id,
                  stage_id: opportunity.stage_id,
                  lost_reason: opportunity.lost_reason,
                  title: opportunity.title,
                  next_action_at: opportunity.next_action_at,
                  pipeline_stages: opportunity.pipeline_stages as { name: string } | null,
                }
              : null
          }
          stages={stages ?? []}
        />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium">Empresa</h2>
          {company ? (
            <dl className="mt-2 space-y-1 text-sm">
              <dt className="text-[var(--muted)]">Nome</dt>
              <dd>{company.name}</dd>
              {(company.city || company.state) && (
                <>
                  <dt className="pt-1 text-[var(--muted)]">Local</dt>
                  <dd>
                    {[company.city, company.state].filter(Boolean).join(" / ")}
                  </dd>
                </>
              )}
              {company.document ? (
                <>
                  <dt className="pt-1 text-[var(--muted)]">Documento</dt>
                  <dd>{company.document}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">Sem empresa vinculada.</p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium">Contato</h2>
          {contact ? (
            <dl className="mt-2 space-y-1 text-sm">
              <dt className="text-[var(--muted)]">Nome</dt>
              <dd>{contact.full_name ?? "—"}</dd>
              <dt className="pt-1 text-[var(--muted)]">Telefone</dt>
              <dd>{contact.phone_e164}</dd>
              {contact.email ? (
                <>
                  <dt className="pt-1 text-[var(--muted)]">E-mail</dt>
                  <dd>{contact.email}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">Sem contato vinculado.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium">Tarefas deste lead</h2>
          <ul className="mt-3 space-y-2">
            {(leadTasks ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2 text-sm last:border-0"
              >
                <span className={t.done ? "text-[var(--muted)] line-through" : ""}>{t.title}</span>
                <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  {t.due_at ? new Date(t.due_at).toLocaleString("pt-BR") : "sem prazo"}
                  <ToggleTaskButton taskId={t.id} done={t.done} />
                </span>
              </li>
            ))}
            {(!leadTasks || leadTasks.length === 0) && (
              <li className="text-sm text-[var(--muted)]">Nenhuma tarefa.</li>
            )}
          </ul>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">Nova tarefa</h3>
            <LeadTaskForm leadId={id} />
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-medium">Nota</h2>
          <div className="mt-3">
            <LeadNoteForm leadId={id} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium">Timeline</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {(timeline ?? []).map((row) => (
            <TimelineEntry key={`${row.kind}-${row.event_id}`} row={row} />
          ))}
          {(!timeline || timeline.length === 0) && (
            <li className="text-[var(--muted)]">Sem eventos ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
