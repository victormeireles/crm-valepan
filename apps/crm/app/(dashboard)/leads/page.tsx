import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { NewLeadForm } from "./new-lead-form";

export default async function LeadsPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: leads } = await crm
    .from("leads")
    .select("id, phone_e164, status, source, created_at, owner_id")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Leads</h1>
      <NewLeadForm />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Criado</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((l) => (
              <tr
                key={l.id}
                className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
              >
                <td className="px-3 py-2">
                  <Link className="text-[var(--accent)] hover:underline" href={`/leads/${l.id}`}>
                    {l.phone_e164}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.status}</td>
                <td className="px-3 py-2">{l.source}</td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {new Date(l.created_at).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!leads || leads.length === 0) && (
          <p className="p-6 text-center text-sm text-[var(--muted)]">Nenhum lead.</p>
        )}
      </div>
    </div>
  );
}
