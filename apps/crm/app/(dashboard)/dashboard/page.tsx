import { LeadIdentity } from "@/components/lead-identity";
import { formatRelativeShort } from "@/lib/format-relative";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normStageName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function KpiCard({
  label,
  value,
  hint,
  subline,
}: {
  label: string;
  value: number | string;
  hint: string;
  subline?: string;
}) {
  return (
    <div
      title={hint}
      className="rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)] transition-shadow duration-200 hover:shadow-[var(--sh-md)]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-ink-muted)]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--vp-wine)]">{value}</p>
      {subline ? <p className="mt-1 text-xs text-[var(--muted)]">{subline}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const nowIso = new Date().toISOString();

  const [
    { count: leadCount },
    { count: openTasks },
    { count: samples },
    { data: stages },
    { data: opps },
    { count: overdue },
    { data: kpiRows, error: kpiError },
    { data: recentLeads },
  ] = await Promise.all([
    crm.from("leads").select("*", { count: "exact", head: true }),
    crm.from("tasks").select("*", { count: "exact", head: true }).eq("done", false),
    crm.from("sample_shipments").select("*", { count: "exact", head: true }).neq("status", "ENVIADO"),
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm.from("opportunities").select("stage_id"),
    crm
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("done", false)
      .not("due_at", "is", null)
      .lt("due_at", nowIso),
    crm.rpc("dashboard_kpis_extra"),
    crm
      .from("leads")
      .select(
        "id, phone_e164, created_at, client_category, contacts(full_name), companies(name), distributors(name)",
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const stageRows = stages ?? [];
  const finalStageIds = new Set(stageRows.filter((s) => s.is_final).map((s) => s.id));
  const openPipelineCount = (opps ?? []).filter(
    (o) => o.stage_id && !finalStageIds.has(o.stage_id),
  ).length;

  const totalOpps = (opps ?? []).length;
  const countByStage = new Map<string, number>();
  for (const o of opps ?? []) {
    if (!o.stage_id) continue;
    countByStage.set(o.stage_id, (countByStage.get(o.stage_id) ?? 0) + 1);
  }

  const funnelRows = stageRows.map((s) => {
    const c = countByStage.get(s.id) ?? 0;
    return {
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      is_final: s.is_final,
      count: c,
      pctTotal: totalOpps > 0 ? Math.round((c / totalOpps) * 1000) / 10 : 0,
    };
  });
  const maxStageCount = Math.max(1, ...funnelRows.map((r) => r.count));

  const convertidoStage = stageRows.find((s) => normStageName(s.name).includes("convertido"));
  const wonCount = convertidoStage ? (countByStage.get(convertidoStage.id) ?? 0) : 0;
  const lostCount = stageRows
    .filter((s) => s.is_final && s.id !== convertidoStage?.id)
    .reduce((acc, s) => acc + (countByStage.get(s.id) ?? 0), 0);

  const cards = [
    { label: "Leads", value: leadCount ?? 0 },
    { label: "Oportunidades no funil", value: openPipelineCount },
    { label: "Tarefas abertas", value: openTasks ?? 0 },
    { label: "Tarefas atrasadas", value: overdue ?? 0 },
    { label: "Amostras (não entregues)", value: samples ?? 0 },
  ];

  const kpi = kpiError ? null : kpiRows?.[0];
  const awaiting = kpi ? num(kpi.leads_awaiting_reply) : null;
  const new7 = kpi ? num(kpi.new_leads_7d) : null;
  const prev7 = kpi ? num(kpi.new_leads_prev_7d) : null;
  const activeConv = kpi ? num(kpi.active_conversations_7d) : null;

  let newLeadsSubline: string | undefined;
  if (new7 !== null && prev7 !== null) {
    const delta = new7 - prev7;
    if (delta === 0) {
      newLeadsSubline = "vs. período anterior: igual";
    } else {
      const sign = delta > 0 ? "+" : "";
      const pct =
        prev7 > 0 ? ` (${sign}${Math.round((delta / prev7) * 100)}%)` : "";
      newLeadsSubline = `vs. período anterior: ${sign}${delta}${pct}`;
    }
  }

  return (
    <div className="space-y-10">
      <div className="border-b border-[var(--border)] pb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--vp-gold-classic)]">Resumo</p>
        <h1
          className="mt-2 text-3xl font-bold tracking-tight text-[var(--vp-wine)] md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Dashboard
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Visão geral do funil e tarefas. Janelas de «novos leads» e conversas ativas usam{" "}
          <strong className="font-semibold text-[var(--vp-ink-body)]">UTC</strong> (timestamps do Supabase).
        </p>
      </div>

      <section className="space-y-4" aria-labelledby="dash-general">
        <h2 id="dash-general" className="sr-only">
          Indicadores gerais
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((c) => (
            <KpiCard
              key={c.label}
              label={c.label}
              value={c.value}
              hint={c.label}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dash-priority">
        <h2
          id="dash-priority"
          className="text-lg font-bold text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Prioridades e tendência
        </h2>
        {kpiError ? (
          <p className="text-sm text-[var(--vp-error)]" role="alert">
            KPIs extra indisponíveis (aplique a migration com a vista e a função{" "}
            <code className="rounded bg-[var(--background)] px-1 text-xs">dashboard_kpis_extra</code>).
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Leads sem resposta"
            value={awaiting ?? "—"}
            hint="Leads distintos com pelo menos uma conversa em que a última mensagem é do cliente (inbound), sem resposta nossa depois."
          />
          <KpiCard
            label="Novos leads (7 dias)"
            value={new7 ?? "—"}
            hint="Leads criados nos últimos 7 dias; comparação com os 7 dias anteriores."
            subline={newLeadsSubline}
          />
          <KpiCard
            label="Conversas ativas (7 dias)"
            value={activeConv ?? "—"}
            hint="Conversas distintas com pelo menos uma mensagem (qualquer direção) nos últimos 7 dias."
          />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dash-funnel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="dash-funnel"
              className="text-lg font-bold text-[var(--vp-wine)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Funil por etapa (números)
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Distribuição atual das oportunidades por etapa. Cada oportunidade aparece em uma única etapa; os
              percentuais são sobre o total de oportunidades ({totalOpps}).
            </p>
          </div>
          <Link
            href="/pipeline"
            className="shrink-0 rounded-lg border border-[var(--vp-gold-classic)] bg-[rgba(199,166,77,0.12)] px-3 py-2 text-xs font-semibold text-[var(--vp-wine)] transition-colors hover:bg-[rgba(199,166,77,0.2)]"
          >
            Ver no quadro Kanban
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)]">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-ink-muted)]">
              Em aberto (não finais)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--vp-wine)]">{openPipelineCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)]">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-ink-muted)]">
              Convertidas
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--vp-wine)]">{wonCount}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {totalOpps > 0 ? `${Math.round((wonCount / totalOpps) * 1000) / 10}% do total` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-sm)]">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-ink-muted)]">
              Encerradas sem conversão
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--vp-wine)]">{lostCount}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {totalOpps > 0 ? `${Math.round((lostCount / totalOpps) * 1000) / 10}% do total` : "—"}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          {funnelRows.length === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
          ) : totalOpps === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--muted)]">Nenhuma oportunidade para exibir.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {funnelRows.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                    <span className="min-w-0 flex-1 text-sm font-medium text-[var(--vp-ink-body)]">
                      {row.name}
                      {row.is_final ? (
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">(final)</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-[var(--vp-wine)]">
                      <strong>{row.count}</strong>
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">{row.pctTotal}%</span>
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2.5 overflow-hidden rounded-full bg-[rgba(35,0,4,0.08)]"
                    role="presentation"
                  >
                    <div
                      className="h-full min-w-[2px] rounded-full bg-[var(--vp-gold-classic)] transition-[width] duration-300"
                      style={{ width: `${(row.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dash-recent-leads">
        <h2
          id="dash-recent-leads"
          className="text-lg font-bold text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Últimos leads
        </h2>
        <div className="overflow-hidden rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          <ul className="divide-y divide-[var(--border)]">
            {(recentLeads ?? []).map((row) => {
              const contact = nestOne(
                row.contacts as
                  | { full_name: string | null }
                  | { full_name: string | null }[]
                  | null,
              );
              const company = nestOne(
                row.companies as
                  | { name: string | null }
                  | { name: string | null }[]
                  | null,
              );
              const distributor = nestOne(
                row.distributors as
                  | { name: string | null }
                  | { name: string | null }[]
                  | null,
              );
              const personName = displayPersonName(contact?.full_name);
              const companyLine = displayCompanyName({
                companyName: company?.name,
                distributorName: distributor?.name,
                clientCategory: row.client_category,
              });
              return (
                <li key={row.id}>
                  <Link
                    href={`/leads/${row.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 transition-colors hover:bg-[rgba(35,0,4,0.04)]"
                  >
                    <div className="min-w-0 flex-1">
                      <LeadIdentity
                        name={personName}
                        companyName={companyLine}
                        category={row.client_category}
                        phoneTitle={row.phone_e164}
                        size="sm"
                        layout="stacked"
                      />
                    </div>
                    <time
                      className="text-xs text-[var(--muted)]"
                      dateTime={row.created_at}
                      title={new Date(row.created_at).toLocaleString("pt-BR")}
                    >
                      {formatRelativeShort(row.created_at)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
          {(!recentLeads || recentLeads.length === 0) && (
            <p className="p-6 text-center text-sm text-[var(--muted)]">Nenhum lead ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}
