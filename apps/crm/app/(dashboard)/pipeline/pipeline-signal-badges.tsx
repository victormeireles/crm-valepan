import { getCustomerWaitSignal, getNextActionSignal } from "@/lib/lead-signals";

export function PipelineSignalBadges({
  lastDirection,
  lastSentAt,
  opportunityUpdatedAt,
  nextActionAt,
}: {
  lastDirection: string | null;
  lastSentAt: string | null;
  opportunityUpdatedAt: string;
  nextActionAt: string | null;
}) {
  const wait = getCustomerWaitSignal({
    lastDirection,
    lastSentAt: lastSentAt ?? opportunityUpdatedAt,
  });
  const nextAction = getNextActionSignal(nextActionAt);
  const emphasized = nextAction.state === "sem_acao" || nextAction.state === "vencida";

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(35,0,4,0.045)] px-2 py-1.5">
        <span className="material-symbols-outlined text-[15px] text-[var(--vp-ink-muted)]" aria-hidden="true">schedule</span>
        <span className="text-[11px] font-bold text-[var(--vp-ink-muted)]">{wait.label}</span>
      </div>
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="material-symbols-outlined text-[15px] text-[var(--vp-gold-deep)]" aria-hidden="true">flag</span>
        <span className={`text-[11px] ${emphasized ? "font-bold text-[var(--vp-ink-body)]" : "font-semibold text-[var(--vp-ink-muted)]"}`}>
          {nextAction.label}
        </span>
      </div>
    </div>
  );
}
