import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { SampleForm } from "./form";

export default async function SamplesPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: samples } = await crm
    .from("sample_shipments")
    .select("id, status, contact_name, address_line, feedback, created_at, leads(phone_e164)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Amostras</h1>
      <SampleForm />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Contato</th>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Criado</th>
            </tr>
          </thead>
          <tbody>
            {(samples ?? []).map((s) => {
              const lead = nestOne(
                s.leads as { phone_e164: string } | { phone_e164: string }[] | null,
              );
              return (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
                >
                  <td className="px-3 py-2">{s.status}</td>
                  <td className="px-3 py-2">{s.contact_name ?? "—"}</td>
                  <td className="px-3 py-2">{lead?.phone_e164 ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!samples || samples.length === 0) && (
          <p className="p-6 text-center text-sm text-[var(--muted)]">Nenhuma amostra.</p>
        )}
      </div>
    </div>
  );
}
