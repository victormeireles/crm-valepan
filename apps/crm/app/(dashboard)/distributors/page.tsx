import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { DistributorForm } from "./form";

export default async function DistributorsPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: distributors } = await crm
    .from("distributors")
    .select("id, name, active, distributor_regions(region_name, state)")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Distribuidores</h1>
      <DistributorForm />
      <ul className="space-y-3">
        {(distributors ?? []).map((d) => {
          const regs = d.distributor_regions as { region_name: string; state: string | null }[] | null;
          return (
            <li key={d.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
              <div className="font-medium">
                {d.name}{" "}
                <span className="text-xs text-[var(--muted)]">{d.active ? "ativo" : "inativo"}</span>
              </div>
              {regs && regs.length > 0 ? (
                <ul className="mt-1 text-xs text-[var(--muted)]">
                  {regs.map((r) => (
                    <li key={r.region_name + (r.state ?? "")}>
                      {r.region_name}
                      {r.state ? ` · ${r.state}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-[var(--muted)]">Sem regiões cadastradas.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
