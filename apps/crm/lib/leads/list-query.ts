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
): Promise<{ rows: LeadListRow[]; error: string | null }> {
  const applyCategoryFilter = <T extends { eq: (col: string, val: string) => T }>(q: T) => {
    if (clientCategory && clientCategory !== "distribuidor") {
      return q.eq("client_category", clientCategory);
    }
    return q;
  };

  let query = applyCategoryFilter(
    crm
      .from("leads")
      .select(LEAD_LIST_SELECT_WITH_NETWORK)
      .order("updated_at", { ascending: false }),
  );

  let { data, error } = await query;

  if (error && isMissingNetworkTypeColumnError(error)) {
    query = applyCategoryFilter(
      crm
        .from("leads")
        .select(LEAD_LIST_SELECT_BASE)
        .order("updated_at", { ascending: false }),
    );
    ({ data, error } = await query);
    if (!error && data) {
      data = data.map((row) => ({ ...row, network_type: null }));
    }
  }

  if (error) {
    return { rows: [], error: error.message };
  }

  return { rows: (data ?? []) as LeadListRow[], error: null };
}
