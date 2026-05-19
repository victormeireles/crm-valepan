import { LEAD_NO_NAME_LABEL } from "@/lib/lead-identity";

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
  /** Nome do contato do lead (exibição no calendário). */
  leadName: string | null;
  /** Nome da empresa do lead, quando houver. */
  companyName: string | null;
  done?: boolean;
  leadId: string | null;
  href: string;
};

/** Título de funil que na prática é telefone/WhatsApp — preferir o nome do lead. */
export function isPhoneLikeCalendarTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.includes("whatsapp")) return true;
  if (/\+\d{6,}/.test(t)) return true;
  return /^[\d\s()+-]{10,}$/.test(t.replace(/\s/g, ""));
}

export type CalendarEventLines = {
  taskTitle: string;
  lead: string | null;
  company: string | null;
};

export function calendarEventLines(ev: CalendarEventDTO): CalendarEventLines {
  const lead =
    ev.leadName && ev.leadName !== LEAD_NO_NAME_LABEL ? ev.leadName.trim() : null;
  const company = ev.companyName?.trim() || null;

  if (ev.kind === "task") {
    return { taskTitle: ev.title, lead, company };
  }

  const raw = ev.title.trim();
  const taskTitle = isPhoneLikeCalendarTitle(raw) ? "Próxima ação do funil" : raw;
  return { taskTitle, lead, company };
}

export function calendarEventTooltip(ev: CalendarEventDTO): string {
  const { taskTitle, lead, company } = calendarEventLines(ev);
  return [taskTitle, lead, company].filter(Boolean).join(" · ");
}

export function buildTaskCalendarEvent(input: {
  id: string;
  title: string;
  at: string;
  done?: boolean;
  leadId: string | null;
  leadName: string | null;
  companyName: string | null;
}): CalendarEventDTO {
  return {
    id: input.id,
    kind: "task",
    at: input.at,
    title: input.title,
    leadName: input.leadName,
    companyName: input.companyName,
    done: input.done,
    leadId: input.leadId,
    href: input.leadId ? `/leads/${input.leadId}` : "/tasks",
  };
}

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

/** Converte valor de `<input type="date">` (YYYY-MM-DD) ou datetime-local para ISO. */
export function parseDueAtFormValue(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** Troca o dia do prazo (dateKey YYYY-MM-DD); tarefas usam só a data (meio-dia local). */
export function mergeLocalDateWithTime(_fromIso: string, dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
}

export { WEEKDAY_LABELS };
