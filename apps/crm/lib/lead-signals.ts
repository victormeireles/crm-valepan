import { formatElapsedShort } from "@/lib/format-relative";

export type CustomerWaitState = "esperando" | "respondido" | "sem_interacao";

export type CustomerWaitSignal = {
  state: CustomerWaitState;
  label: string;
  elapsed: string | null;
};

/**
 * Traduz a direção e o horário da última mensagem em um sinal pronto para UI.
 * O chamador pode usar `last_sent_at` de qualquer uma das views de conversa.
 */
export function getCustomerWaitSignal(input: {
  lastDirection: string | null | undefined;
  lastSentAt: string | null | undefined;
  nowMs?: number;
}): CustomerWaitSignal {
  const elapsed = input.lastSentAt
    ? formatElapsedShort(input.lastSentAt, input.nowMs ?? Date.now())
    : null;

  if (!elapsed) {
    return { state: "sem_interacao", label: "Sem interação", elapsed: null };
  }
  if (input.lastDirection === "in") {
    return { state: "esperando", label: `Cliente esperando há ${elapsed}`, elapsed };
  }
  if (input.lastDirection === "out") {
    return { state: "respondido", label: `Você respondeu há ${elapsed}`, elapsed };
  }
  return { state: "sem_interacao", label: `Sem interação há ${elapsed}`, elapsed };
}

/** Quantidade semanal de pães informada no cadastro do lead. */
export function getWeeklyBreadCount(
  weeklyBreadConsumption: number | null | undefined,
): number | null {
  if (weeklyBreadConsumption == null) return null;
  return Math.round(weeklyBreadConsumption);
}

export function summarizeWeeklyBreadCountByStage<T>(
  items: readonly T[],
  getStageId: (item: T) => string,
  getBreadCount: (item: T) => number | null,
): { byStage: Record<string, number>; total: number } {
  const byStage: Record<string, number> = {};
  let total = 0;

  for (const item of items) {
    const breadCount = getBreadCount(item);
    if (breadCount == null) continue;
    const stageId = getStageId(item);
    byStage[stageId] = (byStage[stageId] ?? 0) + breadCount;
    total += breadCount;
  }

  return { byStage, total };
}

export type NextActionState = "sem_acao" | "vencida" | "hoje" | "futura";

export type NextActionSignal = {
  state: NextActionState;
  label: string;
};

const CRM_TIME_ZONE = "America/Sao_Paulo";

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Estado e label operacional de `opportunities.next_action_at`. */
export function getNextActionSignal(
  nextActionAt: string | null | undefined,
  nowMs = Date.now(),
): NextActionSignal {
  if (!nextActionAt) return { state: "sem_acao", label: "Sem follow-up" };

  const due = new Date(nextActionAt);
  if (!Number.isFinite(due.getTime())) {
    return { state: "sem_acao", label: "Sem follow-up" };
  }

  const dueParts = dateParts(due);
  const nowParts = dateParts(new Date(nowMs));
  const dueKey = `${dueParts.year}-${dueParts.month}-${dueParts.day}`;
  const nowKey = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const shortDate = `${dueParts.day}/${dueParts.month}`;

  if (dueKey < nowKey) return { state: "vencida", label: `Follow-up vencido ${shortDate}` };
  if (dueKey === nowKey) return { state: "hoje", label: "Follow-up hoje" };
  return { state: "futura", label: `Follow-up ${shortDate}` };
}
