import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { SampleForm } from "./form";
import { SampleRowEdit } from "./sample-row-edit";
import { SampleSendViaSelect } from "./sample-send-via-select";
import { SampleStatusSelect } from "./sample-status-select";

export default async function SamplesPage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: samples } = await crm
    .from("sample_shipments")
    .select(
      "id, lead_id, status, send_via, network, contact_name, address_line, business_hours, bread_type, created_at, leads(phone_e164), companies(name), sample_items(description)",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Amostras</h1>
      <SampleForm />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[1100px] text-left text-[13px]">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Enviar por</th>
              <th className="px-2 py-1.5">Rede</th>
              <th className="px-2 py-1.5">Nome</th>
              <th className="px-2 py-1.5">Telefone</th>
              <th className="px-2 py-1.5">Endereço</th>
              <th className="px-2 py-1.5">Horário de funcionamento</th>
              <th className="px-2 py-1.5">Tipo de pão</th>
              <th className="px-2 py-1.5">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(samples ?? []).map((s) => {
              const lead = nestOne(
                s.leads as { phone_e164: string } | { phone_e164: string }[] | null,
              );
              const company = nestOne(
                s.companies as { name: string } | { name: string }[] | null,
              );
              const firstItem = nestOne(
                s.sample_items as { description: string } | { description: string }[] | null,
              );
              const rede = (s.network ?? "").trim() || company?.name || "—";
              const bread =
                (s.bread_type ?? "").trim() || (firstItem?.description ?? "").trim() || "—";
              return (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
                >
                  <td className="px-2 py-1.5">
                    <SampleStatusSelect shipmentId={s.id} status={s.status} />
                  </td>
                  <td className="px-2 py-1.5">
                    <SampleSendViaSelect shipmentId={s.id} sendVia={s.send_via} />
                  </td>
                  <SampleRowEdit
                    shipmentId={s.id}
                    leadId={s.lead_id}
                    network={rede === "—" ? "" : rede}
                    contactName={s.contact_name ?? ""}
                    leadPhone={lead?.phone_e164 ?? ""}
                    addressLine={s.address_line ?? ""}
                    businessHours={s.business_hours ?? ""}
                    breadType={bread === "—" ? "" : bread}
                  />
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
