/** Distribuidor de atendimento (`public.clientes` com tipo_cliente=distribuidor). */
export type DistributorOption = {
  id: string;
  name: string;
};

/** Mantém o distribuidor já marcado visível mesmo se estiver inativo. */
export function distributorOptionsForSelect(
  catalog: readonly DistributorOption[],
  current: DistributorOption | null,
): DistributorOption[] {
  if (!current?.id) return [...catalog];
  if (catalog.some((item) => item.id === current.id)) return [...catalog];
  return [current, ...catalog];
}
