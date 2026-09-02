"use client";

import type { PipelineSignal } from "@/lib/pipeline-signals";

const KPI_CARDS: Array<{
  signal: PipelineSignal | null;
  label: string;
  icon: string;
  border: string;
  iconColor: string;
}> = [
  { signal: "awaiting_reply", label: "Cliente esperando resposta", icon: "mark_chat_unread", border: "border-l-[var(--vp-error)]", iconColor: "text-[var(--vp-error)]" },
  { signal: "followup_overdue", label: "Follow-up vencido", icon: "event_busy", border: "border-l-[var(--vp-gold-classic)]", iconColor: "text-[var(--vp-gold-deep)]" },
  { signal: "stale", label: "Parados 7+ dias", icon: "hourglass_bottom", border: "border-l-[var(--vp-ink-soft)]", iconColor: "text-[var(--vp-ink-soft)]" },
  { signal: null, label: "Volume no funil", icon: "bakery_dining", border: "border-l-[var(--vp-wine)]", iconColor: "text-[var(--vp-wine)]" },
];

export function PipelineKpiStrip({
  awaiting,
  overdue,
  stale,
  volumeKg,
  activeSignal,
  onSignalChange,
}: {
  awaiting: number;
  overdue: number;
  stale: number;
  volumeKg: number;
  activeSignal: PipelineSignal | null;
  onSignalChange: (signal: PipelineSignal | null) => void;
}) {
  const values = [awaiting, overdue, stale, volumeKg];
  const number = new Intl.NumberFormat("pt-BR");

  return (
    <section className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible" aria-label="Indicadores do funil">
      {KPI_CARDS.map((card, index) => {
        const selected = card.signal !== null && activeSignal === card.signal;
        const interactive = card.signal !== null;
        return (
          <button
            key={card.label}
            type="button"
            className={`flex min-h-[78px] min-w-[16rem] snap-start items-center gap-3.5 rounded-[14px] border border-l-4 border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-4 py-3.5 text-left shadow-[var(--sh-sm)] transition-transform ${card.border} ${interactive ? "hover:-translate-y-0.5" : "cursor-default"} ${selected ? "ring-2 ring-[var(--vp-gold-deep)]" : ""}`}
            aria-pressed={interactive ? selected : undefined}
            onClick={() => interactive && onSignalChange(selected ? null : card.signal)}
          >
            <span className={`material-symbols-outlined text-[26px] ${card.iconColor}`} aria-hidden="true">{card.icon}</span>
            <span className="min-w-0">
              <span className="block text-[28px] font-extrabold leading-[1.1] tabular-nums text-[var(--vp-wine)]">
                {number.format(values[index] ?? 0)}{index === 3 ? <span className="ml-1 text-[15px] font-bold">kg/sem</span> : null}
              </span>
              <span className="block text-xs font-bold uppercase tracking-[0.08em] text-[var(--vp-ink-muted)]">{card.label}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
