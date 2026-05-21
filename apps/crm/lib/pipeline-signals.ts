/** Regras pontuais de sinalização no funil (calculadas na leitura, sem gravar em BD). */

import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";

export const PIPELINE_STALE_DAYS = 7;

export const PIPELINE_SIGNALS = [
  "awaiting_reply",
  "replied",
  "stale",
  "followup_overdue",
] as const;

export type PipelineSignal = (typeof PIPELINE_SIGNALS)[number];

export const PIPELINE_SIGNAL_LABELS: Record<PipelineSignal, string> = {
  awaiting_reply: "Sem resposta",
  replied: "Respondido",
  stale: `Parado ${PIPELINE_STALE_DAYS}+ dias`,
  followup_overdue: "Follow-up atrasado",
};

export function isPipelineSignal(value: string): value is PipelineSignal {
  return (PIPELINE_SIGNALS as readonly string[]).includes(value);
}

export function computePipelineSignals(input: {
  oppUpdatedAt: string;
  nextActionAt: string | null;
  isFinalStage: boolean;
  lastMessageDirection: string | null;
}): PipelineSignal[] {
  const signals: PipelineSignal[] = [];
  const now = Date.now();

  if (input.lastMessageDirection === "in") {
    signals.push("awaiting_reply");
  } else if (input.lastMessageDirection === "out") {
    signals.push("replied");
  }

  if (!input.isFinalStage) {
    const updatedMs = new Date(input.oppUpdatedAt).getTime();
    if (Number.isFinite(updatedMs) && now - updatedMs >= PIPELINE_STALE_DAYS * 86_400_000) {
      signals.push("stale");
    }
    if (input.nextActionAt) {
      const dueMs = new Date(input.nextActionAt).getTime();
      if (Number.isFinite(dueMs) && dueMs < now) {
        signals.push("followup_overdue");
      }
    }
  }

  return signals;
}

function normSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Busca por nome, empresa, título da oportunidade ou telefone (com/sem máscara e DDI). */
export function pipelineCardMatchesQuery(
  card: {
    personName: string;
    companyLine: string | null;
    phone_e164: string | null;
    title: string | null;
  },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;

  const qNorm = normSearchText(q);
  const qDigits = phoneDigits(q);

  const textHay = normSearchText(
    [card.personName, card.companyLine ?? "", card.title ?? ""].join(" "),
  );
  if (textHay.includes(qNorm)) return true;

  if (qDigits.length < 4) return false;

  const phoneHay = [
    card.phone_e164 ?? "",
    card.title ?? "",
  ]
    .map(phoneDigits)
    .filter(Boolean)
    .join(" ");

  if (phoneHay.includes(qDigits)) return true;

  const normalizedQuery = normalizeBrazilPhoneToE164(q);
  if (normalizedQuery) {
    const stored = phoneDigits(card.phone_e164 ?? "");
    const fromQuery = phoneDigits(normalizedQuery);
    if (stored.length > 0 && (stored === fromQuery || stored.endsWith(fromQuery) || fromQuery.endsWith(stored))) {
      return true;
    }
  }

  return false;
}

export function cardMatchesPipelineFilters(
  card: {
    personName: string;
    companyLine: string | null;
    phone_e164: string | null;
    title: string | null;
    ownerId: string | null;
    signals: PipelineSignal[];
  },
  filters: {
    ownerUserId: string | null;
    signal: PipelineSignal | null;
    query: string;
  },
): boolean {
  if (filters.ownerUserId) {
    if (card.ownerId !== filters.ownerUserId) return false;
  }
  if (filters.signal && !card.signals.includes(filters.signal)) return false;
  if (!pipelineCardMatchesQuery(card, filters.query)) return false;
  return true;
}
