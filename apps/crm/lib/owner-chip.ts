/** Paleta suave alinhada à Valepan: fundo pastel + texto escuro para contraste. */
export const OWNER_CHIP_PALETTE = [
  { bg: "#f3d9de", fg: "#230004" }, // wine soft
  { bg: "#ffe8b8", fg: "#5c3d00" }, // gold soft
  { bg: "#d8ebe3", fg: "#1a3d32" }, // sage
  { bg: "#d7e8f2", fg: "#0f3048" }, // slate blue
  { bg: "#efe0d4", fg: "#4a2c14" }, // warm clay
  { bg: "#e4dff0", fg: "#2c1f4a" }, // muted violet
  { bg: "#dceee8", fg: "#0f3d36" }, // teal muted
  { bg: "#f0e2d0", fg: "#3d2a12" }, // sand
] as const;

export type OwnerChipColor = (typeof OWNER_CHIP_PALETTE)[number];

/** Hash estável do uuid → índice na paleta. */
export function ownerChipColor(ownerId: string): OwnerChipColor {
  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) >>> 0;
  }
  return OWNER_CHIP_PALETTE[hash % OWNER_CHIP_PALETTE.length]!;
}

/** Primeira letra alfanumérica do nome do responsável. */
export function ownerInitial(name: string | null | undefined): string {
  const match = (name ?? "").trim().match(/[\p{L}\p{N}]/u);
  return match?.[0]?.toUpperCase() ?? "?";
}
