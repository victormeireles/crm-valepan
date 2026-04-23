import { formatRelativeShort } from "@/lib/format-relative";
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
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--sh-sm)]"
    >
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
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
    crm.from("sample_shipments").select("*", { count: "exact", head: true }).neq("status", "delivered"),
    crm.from("pipeline_stages").select("id, is_final"),
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
      .select("id, phone_e164, created_at, contacts(full_name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const finalStageIds = new Set(
    (stages ?? []).filter((s) => s.is_final).map((s) => s.id),
  );
  const openPipelineCount =
    (opps ?? []).filter((o) => o.stage_id && !finalStageIds.has(o.stage_id)).length;

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
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Resumo operacional. Janelas de «novos leads» e conversas ativas usam <strong>UTC</strong> (timestamps do
          Supabase).
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="dash-general">
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

      <section className="space-y-3" aria-labelledby="dash-priority">
        <h2 id="dash-priority" className="text-sm font-semibold text-[var(--foreground)]">
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

      <section className="space-y-3" aria-labelledby="dash-recent-leads">
        <h2 id="dash-recent-leads" className="text-sm font-semibold text-[var(--foreground)]">
          Últimos leads
        </h2>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
          <ul className="divide-y divide-[var(--border)]">
            {(recentLeads ?? []).map((row) => {
              const contact = nestOne(
                row.contacts as
                  | { full_name: string | null }
                  | { full_name: string | null }[]
                  | null,
              );
              const name = contact?.full_name?.trim() || null;
              return (
                <li key={row.id}>
                  <Link
                    href={`/leads/${row.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--vp-surface-low)]"
                  >
                    <div>
                      <span className="font-medium text-[var(--foreground)]">
                        {name ?? row.phone_e164}
                      </span>
                      {name ? (
                        <span className="ml-2 text-sm text-[var(--muted)]">{row.phone_e164}</span>
                      ) : null}
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
