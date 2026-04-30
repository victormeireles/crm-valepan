import { LeadIdentity } from "@/components/lead-identity";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
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
      "id, lead_id, status, send_via, network, contact_name, address_line, business_hours, bread_type, created_at, leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name)), companies(name), sample_items(description)",
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
              <th className="px-2 py-1.5">Lead</th>
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
              type LeadN = {
                phone_e164: string;
                client_category?: string | null;
                contacts?:
                  | { full_name: string | null }
                  | { full_name: string | null }[]
                  | null;
                companies?: { name: string | null } | { name: string | null }[] | null;
                distributors?: { name: string | null } | { name: string | null }[] | null;
              };
              const lead = nestOne(s.leads as LeadN | LeadN[] | null);
              const contact = nestOne(
                (lead?.contacts ?? null) as
                  | { full_name: string | null }
                  | { full_name: string | null }[]
                  | null,
              );
              const leadCompany = nestOne(
                (lead?.companies ?? null) as
                  | { name: string | null }
                  | { name: string | null }[]
                  | null,
              );
              const distributor = nestOne(
                (lead?.distributors ?? null) as
                  | { name: string | null }
                  | { name: string | null }[]
                  | null,
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
              const leadCompanyLine = lead
                ? displayCompanyName({
                    companyName: leadCompany?.name,
                    distributorName: distributor?.name,
                    clientCategory: lead.client_category,
                  })
                : null;
              const leadPersonName = lead ? displayPersonName(contact?.full_name) : "";
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
                  <td className="max-w-[200px] px-2 py-1.5 align-top">
                    {s.lead_id && lead ? (
                      <Link
                        href={`/leads/${s.lead_id}`}
                        className="block text-[var(--accent)] hover:underline"
                      >
                        <LeadIdentity
                          name={leadPersonName}
                          companyName={leadCompanyLine}
                          category={lead.client_category}
                          phoneTitle={lead.phone_e164}
                          size="sm"
                          layout="stacked"
                        />
                      </Link>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
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
