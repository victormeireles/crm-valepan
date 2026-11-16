import type { Database } from "@/lib/database.types";
import type { DistributorOption } from "@/lib/distributors";
import type { crmTables } from "@/lib/supabase/server";

export type DistributorByCepOption = DistributorOption & {
  cepPrioridade: number | null;
  cepDe: string;
  cepAte: string;
};

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

/** Distribuidores ativos cuja faixa de CEP cobre o CEP informado (prioridade menor primeiro). */
export async function fetchDistributorsByCep(
  crm: ReturnType<typeof crmTables>,
  cep: string,
): Promise<{ options: DistributorByCepOption[]; error: string | null }> {
  const { data, error } = await crm.rpc("list_distribuidores_por_cep", {
    p_cep: cep,
  });
  if (error) return { options: [], error: error.message };
  const rows = (data ?? []) as Database["crm"]["Functions"]["list_distribuidores_por_cep"]["Returns"];
  return {
    options: rows.map((row) => ({
      id: row.id,
      name: row.name,
      cepPrioridade: row.cep_prioridade,
      cepDe: row.cep_de,
      cepAte: row.cep_ate,
    })),
    error: null,
  };
}
