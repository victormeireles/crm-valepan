export type LostReasonDTO = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export const LOST_REASON_NAME_MAX = 80;

export function normalizeLostReasonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function lostReasonNamesForSelect(
  reasons: readonly Pick<LostReasonDTO, "name" | "active">[],
  current?: string | null,
): string[] {
  const names = reasons.filter((reason) => reason.active).map((reason) => reason.name);
  const extra = (current ?? "").trim();
  if (extra && !names.includes(extra)) names.unshift(extra);
  return names;
}
