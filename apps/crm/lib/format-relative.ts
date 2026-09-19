const CRM_TIME_ZONE = "America/Sao_Paulo";

/** Data/hora absoluta estável entre servidor e cliente (evita hydration mismatch). */
export function formatAbsoluteShort(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CRM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const pad = (input: string) => input.replace(/\D/g, "").padStart(2, "0");
  return `${pad(value("day"))}/${pad(value("month"))}/${value("year")} ${pad(value("hour"))}:${pad(value("minute"))}`;
}

/** Inteiro em pt-BR sem depender do ICU do Node (evita hydration mismatch). */
export function formatIntegerPt(value: number): string {
  const [sign, digits] = value < 0 ? ["-", String(Math.round(-value))] : ["", String(Math.round(value))];
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

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
  return formatAbsoluteShort(iso);
}

/** Duração passada compacta para sinais operacionais (ex.: 8min, 6h, 3d). */
export function formatElapsedShort(iso: string, nowMs = Date.now()): string | null {
  const thenMs = new Date(iso).getTime();
  if (!Number.isFinite(thenMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - thenMs) / 1_000));
  if (elapsedSeconds < 60) return "agora";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}min`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  return `${Math.floor(elapsedHours / 24)}d`;
}
