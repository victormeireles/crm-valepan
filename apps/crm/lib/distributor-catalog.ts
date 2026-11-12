import type { Database } from "@/lib/database.types";
import type { DistributorOption } from "@/lib/distributors";
import type { crmTables } from "@/lib/supabase/server";

/**
 * Distribuidores de atendimento (`public.clientes`, tipo_cliente=distribuidor) via
 * `crm.list_distribuidores_ativos`. `includeId` mantém visível o distribuidor já vinculado.
 */
export async function fetchDistributorCatalog(
  crm: ReturnType<typeof crmTables>,
  includeId: string | null = null,
): Promise<{ options: DistributorOption[]; error: string | null }> {
  const { data, error } = await crm.rpc("list_distribuidores_ativos", {
    p_include_id: includeId,
  });
  if (error) return { options: [], error: error.message };
  const rows = (data ?? []) as Database["crm"]["Functions"]["list_distribuidores_ativos"]["Returns"];
  return {
    options: rows.map((row) => ({ id: row.id, name: row.name })),
    error: null,
  };
}
