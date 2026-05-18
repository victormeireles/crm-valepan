import { PIPELINE_SIGNAL_LABELS, type PipelineSignal } from "@/lib/pipeline-signals";

const SIGNAL_STYLES: Record<PipelineSignal, string> = {
  awaiting_reply: "border-[var(--vp-error)]/40 bg-[rgba(180,40,40,0.08)] text-[var(--vp-error)]",
  replied: "border-[var(--vp-whatsapp)]/50 bg-[rgba(37,211,102,0.1)] text-[var(--vp-wine)]",
  stale: "border-[var(--border)] bg-[var(--vp-surface-low)] text-[var(--muted)]",
  followup_overdue: "border-[var(--vp-gold-classic)]/50 bg-[rgba(199,166,77,0.15)] text-[var(--vp-wine)]",
};

export function PipelineSignalBadges({ signals }: { signals: PipelineSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-0.5">
      {signals.map((s) => (
        <li
          key={s}
          className={`rounded px-1 py-px text-[9px] font-semibold leading-tight ${SIGNAL_STYLES[s]}`}
          title={PIPELINE_SIGNAL_LABELS[s]}
        >
          {PIPELINE_SIGNAL_LABELS[s]}
        </li>
      ))}
    </ul>
  );
}
