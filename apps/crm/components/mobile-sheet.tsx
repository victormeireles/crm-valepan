"use client";

import { CrmIcon } from "@/components/crm-icon";
import { useEffect, type ReactNode } from "react";

export function MobileSheet({
  open,
  title,
  label,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  label?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:hidden">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-[rgba(35,0,4,0.35)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[min(85dvh,720px)] w-full flex-col rounded-t-3xl bg-[var(--vp-paper-pure)] shadow-[0_-10px_40px_rgba(35,0,4,0.12)] motion-safe:animate-[inbox-sheet-in_300ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex shrink-0 justify-center pt-2">
          <span className="h-[5px] w-10 rounded-full bg-[var(--vp-surface-dim)]" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            {label ? (
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--vp-gold-deep)]">{label}</p>
            ) : null}
            <h2 className="text-[19px] font-extrabold leading-tight text-[var(--vp-ink-body)]">{title}</h2>
            {subtitle ? <p className="mt-1 truncate text-xs text-[var(--vp-ink-muted)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-11 shrink-0 place-items-center text-[var(--vp-wine)]"
          >
            <CrmIcon name="close" className="text-[22px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--vp-ink-line)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        )}
      </div>
    </div>
  );
}
