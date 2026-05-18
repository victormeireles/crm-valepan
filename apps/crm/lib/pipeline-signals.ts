/** Regras pontuais de sinalização no funil (calculadas na leitura, sem gravar em BD). */

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

export function cardMatchesPipelineFilters(
  card: {
    personName: string;
    companyLine: string | null;
    phone_e164: string | null;
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
  const q = filters.query.trim().toLowerCase();
  if (q.length > 0) {
    const hay = [card.personName, card.companyLine ?? "", card.phone_e164 ?? ""]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
