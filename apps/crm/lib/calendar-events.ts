/** Chave de dia no fuso local (YYYY-MM-DD). */
export function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type CalendarEventDTO = {
  id: string;
  kind: "task" | "followup";
  at: string;
  title: string;
  done?: boolean;
  leadId: string | null;
  href: string;
};

export function groupEventsByDateKey(events: CalendarEventDTO[]): Map<string, CalendarEventDTO[]> {
  const map = new Map<string, CalendarEventDTO[]>();
  for (const e of events) {
    const key = toLocalDateKey(e.at);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }
  return map;
}

export function monthStartFromKey(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

export function formatMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const d = monthStartFromKey(monthKey);
  d.setMonth(d.getMonth() + delta);
  return formatMonthKey(d);
}

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/** Semana começa na segunda-feira. */
export function buildMonthGrid(monthKey: string): { dateKey: string | null; day: number | null }[] {
  const start = monthStartFromKey(monthKey);
  const year = start.getFullYear();
  const month = start.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayBased = (start.getDay() + 6) % 7;
  const cells: { dateKey: string | null; day: number | null }[] = [];

  for (let i = 0; i < mondayBased; i++) cells.push({ dateKey: null, day: null });
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ dateKey: key, day });
  }
  while (cells.length % 7 !== 0) cells.push({ dateKey: null, day: null });
  return cells;
}

export function monthTitlePt(monthKey: string): string {
  const d = monthStartFromKey(monthKey);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export { WEEKDAY_LABELS };
