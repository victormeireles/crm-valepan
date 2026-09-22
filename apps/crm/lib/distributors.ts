export const DISTRIBUTOR_NAME_MAX = 80;

/** Registro técnico da carteira, não é um distribuidor escolhível no encaminhamento. */
export const PLACEHOLDER_DISTRIBUTOR_PREFIX = "PENDENTE CARTEIRA · ";

export function isPlaceholderDistributorName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toUpperCase().startsWith(PLACEHOLDER_DISTRIBUTOR_PREFIX);
}

export type DistributorDTO = {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  active: boolean;
};

export type DistributorOption = {
  id: string;
  name: string;
};

export function distributorOptionLabel(input: {
  name: string;
  city?: string | null;
  state?: string | null;
}): string {
  const city = (input.city ?? "").trim();
  const state = (input.state ?? "").trim().toUpperCase();
  const place = [city, state].filter(Boolean).join("/");
  return place ? `${input.name} · ${place}` : input.name;
}

export function compareDistributors(a: DistributorDTO, b: DistributorDTO): number {
  const state = (a.state ?? "ZZ").localeCompare(b.state ?? "ZZ", "pt-BR");
  if (state !== 0) return state;
  const city = (a.city ?? "").localeCompare(b.city ?? "", "pt-BR");
  if (city !== 0) return city;
  return a.name.localeCompare(b.name, "pt-BR");
}

export function normalizeDistributorName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Mantém o distribuidor já marcado visível mesmo se estiver inativo. */
export function distributorOptionsForSelect(
  catalog: readonly DistributorOption[],
  current: DistributorOption | null,
): DistributorOption[] {
  if (!current?.id) return [...catalog];
  if (catalog.some((item) => item.id === current.id)) return [...catalog];
  return [current, ...catalog];
}
