import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const nowIso = new Date().toISOString();

  const [{ count: leadCount }, { count: openTasks }, { count: samples }, { data: stages }, { data: opps }] =
    await Promise.all([
      crm.from("leads").select("*", { count: "exact", head: true }),
      crm
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("done", false),
      crm
        .from("sample_shipments")
        .select("*", { count: "exact", head: true })
        .neq("status", "delivered"),
      crm.from("pipeline_stages").select("id, is_final"),
      crm.from("opportunities").select("stage_id"),
    ]);

  const finalStageIds = new Set(
    (stages ?? []).filter((s) => s.is_final).map((s) => s.id),
  );
  const openPipelineCount =
    (opps ?? []).filter((o) => o.stage_id && !finalStageIds.has(o.stage_id)).length;

  const { count: overdue } = await crm
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("done", false)
    .not("due_at", "is", null)
    .lt("due_at", nowIso);

  const cards = [
    { label: "Leads", value: leadCount ?? 0 },
    { label: "Oportunidades no funil", value: openPipelineCount },
    { label: "Tarefas abertas", value: openTasks ?? 0 },
    { label: "Tarefas atrasadas", value: overdue ?? 0 },
    { label: "Amostras (não entregues)", value: samples ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <p className="text-sm text-[var(--muted)]">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
