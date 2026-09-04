import { getCustomerWaitSignal, getNextActionSignal } from "@/lib/lead-signals";
import { CrmIcon } from "@/components/crm-icon";

export function PipelineSignalBadges({
  lastDirection,
  lastSentAt,
  opportunityUpdatedAt,
  nextActionAt,
  followUpTitle,
  nowMs,
}: {
  lastDirection: string | null;
  lastSentAt: string | null;
  opportunityUpdatedAt: string;
  nextActionAt: string | null;
  followUpTitle: string | null;
  nowMs: number;
}) {
  const wait = getCustomerWaitSignal({
    lastDirection,
    lastSentAt: lastSentAt ?? opportunityUpdatedAt,
    nowMs,
  });
  const nextAction = getNextActionSignal(nextActionAt, nowMs);
  const emphasized = nextAction.state === "sem_acao" || nextAction.state === "vencida";

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(35,0,4,0.045)] px-2 py-1.5">
        <CrmIcon name="schedule" className="text-[15px] text-[var(--vp-ink-muted)]" />
        <span className="text-[11px] font-bold text-[var(--vp-ink-muted)]">{wait.label}</span>
      </div>
      <div className="flex items-center gap-1.5 px-0.5">
        <CrmIcon name="flag" className="text-[15px] text-[var(--vp-gold-deep)]" />
        <span
          title={followUpTitle ?? nextAction.label}
          className={`truncate text-[11px] ${emphasized ? "font-bold text-[var(--vp-ink-body)]" : "font-semibold text-[var(--vp-ink-muted)]"}`}
        >
          {followUpTitle ? `${followUpTitle} · ${nextAction.label}` : nextAction.label}
        </span>
      </div>
    </div>
  );
}
