import type { crmTables } from "@/lib/supabase/server";

/** PostgREST quando a migration `20260428160000_leads_network_type` ainda não foi aplicada. */
export function isMissingNetworkTypeColumnError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("network_type") &&
    (msg.includes("schema cache") || msg.includes("does not exist"))
  );
}

export const LEAD_LIST_SELECT_BASE =
  "id, phone_e164, status, source, created_at, owner_id, client_category, distributor_id, company_id, contacts(id,full_name), companies(id,name,city,document), distributors(id,name)";

export const LEAD_LIST_SELECT_WITH_NETWORK = `${LEAD_LIST_SELECT_BASE}, network_type`;

export type LeadListRow = {
  id: string;
  phone_e164: string;
  status: string;
  source: string;
  created_at: string;
  owner_id: string | null;
  client_category: string | null;
  distributor_id: string | null;
  company_id: string | null;
  network_type?: string | null;
  contacts:
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null
    | undefined;
  companies:
    | { id: string; name: string | null; city: string | null; document: string | null }
    | { id: string; name: string | null; city: string | null; document: string | null }[]
    | null
    | undefined;
  distributors:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null
    | undefined;
};

type CrmClient = ReturnType<typeof crmTables>;

export async function fetchLeadListRows(
  crm: CrmClient,
  clientCategory: string | null,
  page: number,
  pageSize: number,
): Promise<{ rows: LeadListRow[]; error: string | null; totalCount: number }> {
  let query = crm.from("leads").select(LEAD_LIST_SELECT_WITH_NETWORK, { count: "exact" });
  if (clientCategory === "distribuidor") {
    query = query
      .or("client_category.eq.distribuidor,distributor_id.not.is.null,network_type.eq.distribuidor")
      .or("excluded_from_pipeline_at.is.null,excluded_reason.eq.cliente");
  } else {
    query = query.is("excluded_from_pipeline_at", null);
    if (clientCategory) query = query.eq("client_category", clientCategory);
  }
  query = query
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;

  if (error && isMissingNetworkTypeColumnError(error)) {
    let fallbackQuery = crm
      .from("leads")
      .select(LEAD_LIST_SELECT_BASE, { count: "exact" });
    if (clientCategory === "distribuidor") {
      fallbackQuery = fallbackQuery
        .or("client_category.eq.distribuidor,distributor_id.not.is.null")
        .or("excluded_from_pipeline_at.is.null,excluded_reason.eq.cliente");
    } else {
      fallbackQuery = fallbackQuery.is("excluded_from_pipeline_at", null);
      if (clientCategory) {
        fallbackQuery = fallbackQuery.eq("client_category", clientCategory);
      }
    }
    fallbackQuery = fallbackQuery
      .order("updated_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    const fallback = await fallbackQuery;
    if (fallback.error) {
      return { rows: [], error: fallback.error.message, totalCount: 0 };
    }
    return {
      rows: (fallback.data ?? []).map((row) => ({ ...row, network_type: null })) as LeadListRow[],
      error: null,
      totalCount: fallback.count ?? 0,
    };
  }

  if (error) {
    return { rows: [], error: error.message, totalCount: 0 };
  }

  return { rows: (data ?? []) as LeadListRow[], error: null, totalCount: count ?? 0 };
}
