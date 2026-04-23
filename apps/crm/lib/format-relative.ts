/** Data/hora recente em linguagem natural (pt-BR), para listas e inbox. */
export function formatRelativeShort(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const absSec = Math.abs(diffSec);
  if (absSec < 45) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 36) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 14) return rtf.format(diffDay, "day");
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
