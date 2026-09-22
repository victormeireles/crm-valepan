import { distributorOptionLabel } from "@/lib/distributors";
import { isForwardedToDistributorSubstage, substageLabelOnCard } from "@/lib/pipeline-substages";
import { LeadIdentity } from "@/components/lead-identity";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadNoteForm } from "./lead-note-form";
import { LeadOwnerForm } from "./lead-owner-form";
import { LeadTaskForm } from "./lead-task-form";
import { LeadTaskAssigneeSelect } from "./lead-task-assignee-select";
import { TimelineEntry } from "./timeline-entry";
import { buildTaskCalendarEvent } from "@/lib/calendar-events";
import { CalendarEventLinesDisplay } from "../../tasks/calendar-event-display";
import { ToggleTaskButton } from "../../tasks/toggle-task-button";
import { LeadActions } from "./ui";
import { LeadFollowUp } from "@/components/lead-follow-up";
import { toFollowUpDTO } from "@/lib/follow-ups";
import { formatCaptureZip, formatLeadSource } from "@/lib/lead-capture";
import { formatCpfCnpj } from "@/lib/cpf-cnpj";
import { selectCanonicalPipelineStages } from "@/lib/pipeline-canonical-stages";

const TEAM_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  const role = TEAM_ROLE_LABEL[p.role] ?? p.role;
  return { id: p.id, label: `${name} (${role})` };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const [
    { data: lead },
    { data: opps },
    { data: stages },
    { data: timeline },
    { data: leadTasksRaw },
    { data: teamProfiles },
    { data: registrations },
    { data: lostReasonRows },
    { data: distributorCatalog },
  ] = await Promise.all([
    crm
      .from("leads")
      .select(
        "*, companies(id, name, city, state, document), contacts(id, full_name, email, phone_e164), distributors(id, name)",
      )
      .eq("id", id)
      .maybeSingle(),
    crm
      .from("opportunities")
      .select("*, pipeline_stages(name)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    crm.from("pipeline_stages").select("id, name, sort_order, is_final").order("sort_order", { ascending: true }),
    crm
      .from("timeline_events")
      .select("*")
      .eq("lead_id", id)
      .order("at", { ascending: false })
      .limit(120),
    crm
      .from("tasks")
      .select("id, title, due_at, done, assignee_id, task_kind")
      .eq("lead_id", id)
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false }),
    crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
    crm.from("lead_registrations").select("id, source, cpf_cnpj")
      .eq("lead_id", id).not("cpf_cnpj", "is", null).order("created_at", { ascending: false }).limit(5),
    crm.from("lost_reasons").select("id, name, stage_key, sort_order, active").order("sort_order", { ascending: true }),
    crm.from("distributors").select("id, name, distributor_regions(region_name, state)").eq("active", true).not("name", "ilike", "PENDENTE CARTEIRA · %").order("name", { ascending: true }),
  ]);

  if (!lead) notFound();

  const company = nestOne(
    lead.companies as
      | { id: string; name: string; city: string | null; state: string | null; document: string | null }
      | {
          id: string;
          name: string;
          city: string | null;
          state: string | null;
          document: string | null;
        }[]
      | null,
  );
  const contact = lead.contacts as
    | { id: string; full_name: string | null; email: string | null; phone_e164: string }
    | null;
  const distributor = lead.distributors as { id: string; name: string } | null;

  const heading = displayPersonName(contact?.full_name);
  const companyLine = displayCompanyName({
    companyName: company?.name,
    distributorName: distributor?.name,
    clientCategory: lead.client_category,
  });

  const leadOwnerId = lead.owner_id ?? null;

  const opportunity = opps?.[0] ?? null;
  const leadFollowUpRow = leadTasksRaw?.find(
    (task) => task.task_kind === "follow_up" && !task.done,
  );
  const leadFollowUp = leadFollowUpRow ? toFollowUpDTO(leadFollowUpRow) : null;
  const leadTasks = leadTasksRaw?.filter((task) => task.task_kind !== "follow_up");
  const teamOptions = (teamProfiles ?? []).map(formatTeamOption);
  const assigneeLabel = new Map(teamOptions.map((o) => [o.id, o.label]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/leads" className="text-sm text-[var(--muted)] hover:underline">
            ← Leads
          </Link>
          <div className="mt-1">
            <LeadIdentity
              name={heading}
              companyName={companyLine}
              category={lead.client_category}
              phoneTitle={lead.phone_e164}
              size="md"
              layout="stacked"
              trailing={
                opportunity?.lost_reason ? (
                  <span
                    className="rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-[var(--vp-wine)]"
                    title={
                      isForwardedToDistributorSubstage(opportunity.lost_reason) &&
                      substageLabelOnCard(opportunity.lost_reason, distributor?.name) !== opportunity.lost_reason
                        ? opportunity.lost_reason
                        : "Subclassificação"
                    }
                  >
                    {substageLabelOnCard(opportunity.lost_reason, distributor?.name)}
                  </span>
                ) : null
              }
            />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Status: {lead.status} · Origem: {formatLeadSource(lead.source)}
          </p>
          {lead.zip_code ? <p className="text-sm text-[var(--muted)]">CEP: {formatCaptureZip(lead.zip_code)}</p> : null}
          {registrations?.map((registration) => registration.cpf_cnpj ? (
            <p key={registration.id} className="text-sm text-[var(--muted)]">
              CPF/CNPJ: {formatCpfCnpj(registration.cpf_cnpj)} · Informado no {formatLeadSource(registration.source)}
            </p>
          ) : null)}
          <div className="mt-3 max-w-md">
            <LeadOwnerForm leadId={id} ownerId={leadOwnerId} teamOptions={teamOptions} />
          </div>
        </div>
        <LeadActions
          key={opportunity?.id ?? "no-opp"}
          leadId={id}
          clientCategory={lead.client_category ?? null}
          distributorId={distributor?.id ?? null}
          distributorName={(distributor?.name ?? "").trim().toUpperCase()}
          distributors={(distributorCatalog ?? []).map((row) => {
            const regions = row.distributor_regions as
              | { region_name: string; state: string | null }
              | { region_name: string; state: string | null }[]
              | null;
            const region = Array.isArray(regions) ? regions[0] : regions;
            return {
              id: row.id,
              name: distributorOptionLabel({
                name: row.name,
                city: region?.region_name,
                state: region?.state,
              }),
            };
          })}
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
                  pipeline_stages: opportunity.pipeline_stages as { name: string } | null,
                }
              : null
          }
          stages={selectCanonicalPipelineStages(stages ?? [])}
          lostReasons={(lostReasonRows ?? []).map((reason) => ({
            id: reason.id,
            name: reason.name,
            stage_key: reason.stage_key,
            sort_order: reason.sort_order,
            active: reason.active,
          }))}
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
                className="flex flex-col gap-2 border-b border-[var(--border)] pb-3 text-sm last:border-0 md:flex-row md:flex-wrap md:items-center md:justify-between"
              >
                <div className={`min-w-0 flex-1 ${t.done ? "opacity-80" : ""}`}>
                  <CalendarEventLinesDisplay
                    ev={buildTaskCalendarEvent({
                      id: t.id,
                      title: t.title,
                      at: t.due_at ?? new Date(0).toISOString(),
                      done: t.done,
                      leadId: id,
                      leadName: heading,
                      companyName: companyLine,
                    })}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {t.assignee_id
                      ? (assigneeLabel.get(t.assignee_id) ?? "Responsável desconhecido")
                      : "Não atribuído"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <LeadTaskAssigneeSelect
                    taskId={t.id}
                    assigneeId={t.assignee_id ?? null}
                    teamOptions={teamOptions}
                  />
                  <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                    {t.due_at ? new Date(t.due_at).toLocaleDateString("pt-BR") : "Sem prazo"}
                  </span>
                  <ToggleTaskButton taskId={t.id} done={t.done} />
                </div>
              </li>
            ))}
            {(!leadTasks || leadTasks.length === 0) && (
              <li className="text-sm text-[var(--muted)]">Nenhuma tarefa.</li>
            )}
          </ul>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">Nova tarefa</h3>
            <LeadTaskForm
              key={`tf-${leadOwnerId ?? "none"}`}
              leadId={id}
              opportunityId={opportunity?.id ?? null}
              teamOptions={teamOptions}
              defaultAssigneeId={leadOwnerId}
            />
          </div>
        </div>
        <div className="space-y-4">
          <div id="follow-up" className="scroll-mt-28 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <LeadFollowUp
              leadId={id}
              initialFollowUp={leadFollowUp}
              teamOptions={teamOptions}
              defaultAssigneeId={leadOwnerId}
            />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-medium">Nota</h2>
            <div className="mt-3">
              <LeadNoteForm leadId={id} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium">Timeline</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Mensagens, notas, tarefas, amostras e alterações do funil (últimos 120 eventos).
        </p>
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
