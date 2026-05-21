import { LeadIdentity } from "@/components/lead-identity";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { isClientCategoryValue, type ClientCategoryValue } from "@/lib/client-categories";
import { SEND_VIA_OPTIONS } from "@/lib/send-via-options";
import { leadListRowMatchesQuery } from "@/lib/crm-text-search";
import { fetchLeadListRows, type LeadListRow } from "@/lib/leads/list-query";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { LeadCategoryRowEdit } from "./lead-category-row-edit";
import { LeadsFilters } from "./leads-filters";

/** Evita cache da lista após salvar (router.refresh + dados atualizados do Supabase). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CATEGORY_PAGE_TITLES: Record<ClientCategoryValue, string> = {
  hamburgueria: "Hamburguerias",
  distribuidor: "Carteira de Distribuidores",
  parceiros: "Parceiros",
  outros: "Outros",
};

function formatPhoneForDisplay(input: string): string {
  const digits = input.replace(/\D/g, "");
  const normalized =
    digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;

  if (normalized.length <= 2) return normalized;
  if (normalized.length <= 6) return `(${normalized.slice(0, 2)}) ${normalized.slice(2)}`;
  if (normalized.length <= 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6, 10)}`;
  }
  return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7, 11)}`;
}

function formatLeadSource(source: string): string {
  const s = source.trim().toLowerCase();
  if (s === "whatsapp") return "WhatsApp";
  if (s === "manual") return "Manual";
  return source;
}

function formatLeadStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "open") return "Aberto";
  if (s === "closed") return "Fechado";
  return status;
}

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
          const byDistributor = new Map<string, (typeof distributorSourceRows)[number]>();
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

  const visibleCount =
    clientCategory === "distribuidor" ? distributorRows.length : filteredLeadRows.length;
  const totalCount =
    clientCategory === "distribuidor" ? distributorSourceRows.length : leadRows.length;

  const pageTitle = clientCategory ? CATEGORY_PAGE_TITLES[clientCategory] : "Leads";
  const listPanelTitle = clientCategory ? `Lista — ${CATEGORY_PAGE_TITLES[clientCategory]}` : "Lista de leads";

  const emptyMessage =
    query.trim().length > 0
      ? `Nenhum lead encontrado para «${query.trim()}».`
      : clientCategory
        ? "Nenhum lead nesta categoria."
        : "Nenhum lead na lista.";

  const showEmpty =
    clientCategory === "distribuidor"
      ? distributorRows.length === 0
      : clientCategory
        ? filteredLeadRows.length === 0
        : filteredLeadRows.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {clientCategory
            ? "Edite rede, classificação e contato na tabela. Novos contatos entram pelo "
            : "Consulta e busca de todos os leads. Novos contatos entram pelo "}
          <Link href="/inbox" className="font-medium text-[var(--accent)] hover:underline">
            Chat (Inbox)
          </Link>
          .
        </p>
      </div>

      {leadsError ? (
        <div
          className="rounded-lg border border-[color:var(--border-strong)] bg-[var(--vp-surface)] px-3 py-2 text-sm text-[var(--vp-wine-classic)]"
          role="alert"
        >
          <p className="font-medium">Não foi possível carregar a lista de leads.</p>
          <p className="mt-1 font-mono text-xs opacity-90">{leadsError}</p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <h2 className="text-sm font-semibold text-[var(--vp-wine)]">{listPanelTitle}</h2>
        </div>

        <Suspense fallback={<p className="px-3 py-2 text-sm text-[var(--muted)]">Carregando…</p>}>
          <LeadsFilters totalCount={totalCount} visibleCount={visibleCount} />
        </Suspense>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[rgba(35,0,4,0.04)] text-xs font-semibold uppercase tracking-[0.06em] text-[var(--vp-wine)]">
              {clientCategory ? (
                <tr>
                  <th className="px-3 py-2.5">Rede</th>
                  <th className="px-3 py-2.5">Classificação</th>
                  <th className="px-3 py-2.5">CNPJ</th>
                  <th className="px-3 py-2.5">Nome</th>
                  <th className="px-3 py-2.5">Telefone</th>
                  <th className="px-3 py-2.5">Cidade</th>
                  <th className="px-3 py-2.5">Opções</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2.5">Contato</th>
                  <th className="px-3 py-2.5">Telefone</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Origem</th>
                  <th className="px-3 py-2.5">Entrada</th>
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
                        companyDocument={
                          row.lead ? (nestOne(row.lead.companies)?.document ?? "").trim() : ""
                        }
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
                        <td className="px-3 py-2.5">
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
                        <td className="px-3 py-2.5 tabular-nums text-[var(--foreground)]">
                          {l.phone_e164 ? formatPhoneForDisplay(l.phone_e164) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full bg-[rgba(35,0,4,0.06)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                            {formatLeadStatus(l.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--muted)]">
                          {formatLeadSource(l.source)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-[var(--muted)]">
                          {new Date(l.created_at).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {showEmpty ? (
          <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">{emptyMessage}</p>
        ) : null}
      </section>
    </div>
  );
}
