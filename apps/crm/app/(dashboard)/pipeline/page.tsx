import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

type StageRow = { name: string; sort_order: number };

export default async function PipelinePage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: rows } = await crm
    .from("opportunities")
    .select(
      "id, title, lead_id, stage_id, lost_reason, pipeline_stages(name, sort_order), leads(phone_e164)",
    )
    .order("updated_at", { ascending: false });

  const byStage = new Map<string, typeof rows>();
  for (const r of rows ?? []) {
    const ps = nestOne(r.pipeline_stages as StageRow | StageRow[] | null);
    const st = ps?.name ?? "—";
    if (!byStage.has(st)) byStage.set(st, []);
    byStage.get(st)!.push(r);
  }

  const ordered = [...byStage.entries()].sort((a, b) => {
    const rowA = (a[1] ?? [])[0];
    const rowB = (b[1] ?? [])[0];
    const sa =
      nestOne(rowA?.pipeline_stages as StageRow | StageRow[] | null | undefined)
        ?.sort_order ?? 0;
    const sb =
      nestOne(rowB?.pipeline_stages as StageRow | StageRow[] | null | undefined)
        ?.sort_order ?? 0;
    return sa - sb;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Funil</h1>
        <p className="text-sm text-[var(--muted)]">
          {rows?.length ?? 0} oportunidade{(rows?.length ?? 0) === 1 ? "" : "s"}
        </p>
      </div>
      {ordered.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {ordered.map(([stage, items]) => (
            <span
              key={stage}
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[var(--muted)]"
            >
              {stage}:{" "}
              <strong className="text-[var(--foreground)]">{items?.length ?? 0}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ordered.map(([stage, items]) => (
          <section
            key={stage}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <h2 className="text-sm font-medium text-[var(--muted)]">{stage}</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(items ?? []).map((o) => {
                const lead = nestOne(
                  o.leads as { phone_e164: string } | { phone_e164: string }[] | null,
                );
                return (
                  <li key={o.id} className="rounded border border-[var(--border)] px-2 py-1">
                    <a className="font-medium hover:underline" href={`/leads/${o.lead_id}`}>
                      {lead?.phone_e164 ?? o.title ?? o.id}
                    </a>
                    {o.lost_reason ? (
                      <p className="text-xs text-[var(--muted)]">Motivo: {o.lost_reason}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {(!rows || rows.length === 0) && (
        <p className="text-sm text-[var(--muted)]">Nenhuma oportunidade.</p>
      )}
    </div>
  );
}
