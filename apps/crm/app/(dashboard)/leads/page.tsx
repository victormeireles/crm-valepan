import { LeadIdentity } from "@/components/lead-identity";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { isClientCategoryValue } from "@/lib/client-categories";
import { SEND_VIA_OPTIONS } from "@/lib/send-via-options";
import { leadListRowMatchesQuery } from "@/lib/crm-text-search";
import { fetchLeadListRows, type LeadListRow } from "@/lib/leads/list-query";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { NewLeadForm } from "./new-lead-form";
import { LeadCategoryRowEdit } from "./lead-category-row-edit";
import { LeadsFilters } from "./leads-filters";

/** Evita cache da lista após salvar (router.refresh + dados atualizados do Supabase). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function leadContactName(l: {
  contacts:
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null
    | undefined;
}) {
  return (nestOne(l.contacts)?.full_name ?? "").trim();
}

function leadRowSearchFields(l: LeadListRow) {
  return {
    phone_e164: l.phone_e164,
    contactName: leadContactName(l),
    companyName: (nestOne(l.companies)?.name ?? "").trim() || null,
    distributorName: (nestOne(l.distributors)?.name ?? "").trim() || null,
    city: (nestOne(l.companies)?.city ?? "").trim() || null,
    document: (nestOne(l.companies)?.document ?? "").trim() || null,
    status: l.status,
    source: l.source,
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const rawCat = sp.client_category;
  const clientCategory =
    typeof rawCat === "string" && isClientCategoryValue(rawCat) ? rawCat : null;
  const query = typeof sp.q === "string" ? sp.q : "";

  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { rows: leadRows, error: leadsError } = await fetchLeadListRows(crm, clientCategory);

  const matchesQuery = (l: LeadListRow) =>
    query.trim().length === 0 || leadListRowMatchesQuery(leadRowSearchFields(l), query);

  const filteredLeadRows = leadRows.filter(matchesQuery);

  const distributorSourceRows =
    clientCategory === "distribuidor"
      ? leadRows.filter((lead) => {
          const category = (lead.client_category ?? "").trim().toLowerCase();
          const networkType = (lead.network_type ?? "").trim().toLowerCase();
          return category === "distribuidor" || !!lead.distributor_id || networkType === "distribuidor";
        })
      : filteredLeadRows;

  const filteredDistributorSourceRows = distributorSourceRows.filter(matchesQuery);

  const distributorRows =
    clientCategory === "distribuidor"
      ? (() => {
          const byDistributor = new Map<
            string,
            (typeof distributorSourceRows)[number]
          >();
          const pending: (typeof distributorSourceRows)[number][] = [];

          for (const lead of filteredDistributorSourceRows) {
            const distName = (nestOne(lead.distributors)?.name ?? "").trim().toUpperCase();
            if (distName && SEND_VIA_OPTIONS.includes(distName as (typeof SEND_VIA_OPTIONS)[number])) {
              if (!byDistributor.has(distName)) {
                byDistributor.set(distName, lead);
              }
            } else {
              pending.push(lead);
            }
          }

          const pendingRows = pending.map((lead) => ({
            distributorName: (nestOne(lead.distributors)?.name ?? "").trim().toUpperCase(),
            lead,
            distributorLocked: false,
          }));

          const fixedRows = SEND_VIA_OPTIONS.map((option) => {
            const mapped = byDistributor.get(option) ?? null;
            return {
              distributorName: option,
              lead: mapped,
              distributorLocked: true,
            };
          });

          const all = [...pendingRows, ...fixedRows];
          if (query.trim().length === 0) return all;
          return all.filter((row) => {
            if (row.lead && matchesQuery(row.lead)) return true;
            return leadListRowMatchesQuery(
              {
                phone_e164: "",
                contactName: "",
                companyName: null,
                distributorName: row.distributorName,
              },
              query,
            );
          });
        })()
      : [];

  const visibleCount = clientCategory === "distribuidor" ? distributorRows.length : filteredLeadRows.length;
  const totalCount = clientCategory === "distribuidor" ? distributorSourceRows.length : leadRows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {clientCategory === "distribuidor" ? "Carteira de Distribuidores" : "Leads"}
        </h1>
        {clientCategory ? (
          <p className="text-sm text-[var(--muted)]">
            Filtro: <span className="font-medium text-[var(--foreground)]">{clientCategory}</span> ·{" "}
            <Link className="text-[var(--accent)] hover:underline" href="/leads">
              limpar
            </Link>
          </p>
        ) : null}
      </div>
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Carregando busca…</p>}>
        <LeadsFilters totalCount={totalCount} visibleCount={visibleCount} />
      </Suspense>
      <NewLeadForm categoryMode={clientCategory} />
      {leadsError ? (
        <div
          className="rounded-lg border border-[color:var(--border-strong)] bg-[var(--vp-surface)] px-3 py-2 text-sm text-[var(--vp-wine-classic)]"
          role="alert"
        >
          <p className="font-medium">Não foi possível carregar a lista de leads.</p>
          <p className="mt-1 font-mono text-xs opacity-90">{leadsError}</p>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            {clientCategory ? (
              <tr>
                <th className="px-2 py-2">Rede</th>
                <th className="px-2 py-2">Classificação</th>
                <th className="px-2 py-2">CNPJ</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Telefone</th>
                <th className="px-2 py-2">Cidade</th>
                <th className="px-2 py-2">Opções</th>
              </tr>
            ) : (
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Criado</th>
              </tr>
            )}
          </thead>
          <tbody>
            {clientCategory === "distribuidor"
              ? distributorRows.map((row) => (
                  <tr
                    key={`${row.distributorName || "pendente"}-${row.lead?.id ?? "empty"}`}
                    className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
                  >
                    <LeadCategoryRowEdit
                      leadId={row.lead?.id ?? null}
                      clientCategory="distribuidor"
                      distributorName={row.distributorName}
                      distributorLocked={row.distributorLocked}
                      leadStatus={(row.lead?.status ?? "").trim().toLowerCase()}
                      networkType={(row.lead?.network_type ?? "").trim().toLowerCase()}
                      contactName={row.lead ? leadContactName(row.lead) : ""}
                      leadPhone={row.lead?.phone_e164 ?? ""}
                      city={row.lead ? (nestOne(row.lead.companies)?.city ?? "").trim() : ""}
                      companyDocument={row.lead ? (nestOne(row.lead.companies)?.document ?? "").trim() : ""}
                    />
                  </tr>
                ))
              : clientCategory
                ? filteredLeadRows.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
                    >
                      <LeadCategoryRowEdit
                        leadId={l.id}
                        clientCategory={clientCategory}
                        distributorName={(nestOne(l.distributors)?.name ?? "").trim().toUpperCase()}
                        distributorLocked={false}
                        leadStatus={(l.status ?? "").trim().toLowerCase()}
                        networkType={(l.network_type ?? "").trim().toLowerCase()}
                        contactName={leadContactName(l)}
                        leadPhone={l.phone_e164 ?? ""}
                        city={(nestOne(l.companies)?.city ?? "").trim()}
                        companyDocument={(nestOne(l.companies)?.document ?? "").trim()}
                      />
                    </tr>
                  ))
              : filteredLeadRows.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--vp-surface-low)]"
                  >
                    <td className="px-3 py-2">
                      <Link
                        className="block min-w-0 text-[var(--accent)] hover:underline"
                        href={`/leads/${l.id}`}
                      >
                        <LeadIdentity
                          name={displayPersonName(nestOne(l.contacts)?.full_name)}
                          companyName={displayCompanyName({
                            companyName: nestOne(l.companies)?.name,
                            distributorName: nestOne(l.distributors)?.name,
                            clientCategory: l.client_category,
                          })}
                          category={l.client_category}
                          phoneTitle={l.phone_e164}
                          size="sm"
                          layout="stacked"
                        />
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
        {clientCategory === "distribuidor" &&
          distributorRows.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--muted)]">
              {query.trim().length > 0
                ? `Nenhum lead encontrado para «${query.trim()}».`
                : "Nenhum lead nesta categoria."}
            </p>
          )}
        {clientCategory && clientCategory !== "distribuidor" && filteredLeadRows.length === 0 && (
          <p className="p-6 text-center text-sm text-[var(--muted)]">
            {query.trim().length > 0
              ? `Nenhum lead encontrado para «${query.trim()}».`
              : "Nenhum lead nesta categoria."}
          </p>
        )}
        {!clientCategory && filteredLeadRows.length === 0 && (
          <p className="p-6 text-center text-sm text-[var(--muted)]">
            {query.trim().length > 0
              ? `Nenhum lead encontrado para «${query.trim()}».`
              : "Nenhum lead."}
          </p>
        )}
      </div>
    </div>
  );
}
