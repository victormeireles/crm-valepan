export const NETWORK_TYPE_OPTIONS = [
  "distribuidor",
  "representante comercial",
  "operador logístico",
] as const;

export type NetworkTypeOption = (typeof NETWORK_TYPE_OPTIONS)[number];

export function isNetworkTypeOption(v: string): v is NetworkTypeOption {
  return (NETWORK_TYPE_OPTIONS as readonly string[]).includes(v);
}
