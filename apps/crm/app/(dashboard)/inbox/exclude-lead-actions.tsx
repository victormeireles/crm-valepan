"use client";

import {
  excludeLeadFromPipeline,
  restoreLeadToPipeline,
} from "@/app/actions/lead-pipeline-exclusion";
import {
  LEAD_EXCLUSION_REASONS,
  LEAD_EXCLUSION_REASON_LABELS,
  type LeadExclusionReason,
} from "@/lib/lead-pipeline-exclusion";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

function ActionPanel({
  children,
  onCancel,
  busy,
  err,
  confirmLabel,
  onConfirm,
}: {
  children: ReactNode;
  onCancel: () => void;
  busy: boolean;
  err: string | null;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--vp-paper-pure)] p-3 shadow-[var(--sh-sm)]">
      {children}
      {err ? <p className="mt-2 text-[11px] text-[var(--vp-error)]">{err}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onConfirm()}
          className="rounded-md bg-[var(--vp-wine)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Salvando…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function ExcludeLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<LeadExclusionReason>("interno");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--vp-wine)] hover:text-[var(--vp-wine)]"
      >
        Não é lead
      </button>
    );
  }

  return (
    <ActionPanel
      busy={busy}
      err={err}
      confirmLabel="Arquivar"
      onCancel={() => {
        setOpen(false);
        setErr(null);
      }}
      onConfirm={async () => {
        setBusy(true);
        setErr(null);
        const res = await excludeLeadFromPipeline({ leadId, reason });
        setBusy(false);
        if (!res.ok) {
          setErr(res.error ?? "Erro ao arquivar.");
          return;
        }
        setOpen(false);
        router.refresh();
        router.push("/inbox?tab=archived");
      }}
    >
      <p className="text-xs font-medium text-[var(--foreground)]">Arquivar conversa</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        A conversa continua no WhatsApp, mas some da lista de prospects e do funil.
      </p>
      <label className="mt-2 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
        Motivo
      </label>
      <select
        value={reason}
        disabled={busy}
        onChange={(e) => setReason(e.target.value as LeadExclusionReason)}
        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1.5 text-xs"
      >
        {LEAD_EXCLUSION_REASONS.map((r) => (
          <option key={r} value={r}>
            {LEAD_EXCLUSION_REASON_LABELS[r]}
          </option>
        ))}
      </select>
    </ActionPanel>
  );
}

export function RestoreLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] px-3 py-1.5 text-xs font-medium text-[var(--vp-wine)] hover:bg-[rgba(35,0,4,0.04)]"
      >
        Restaurar como prospect
      </button>
    );
  }

  return (
    <ActionPanel
      busy={busy}
      err={err}
      confirmLabel="Restaurar"
      onCancel={() => {
        setOpen(false);
        setErr(null);
      }}
      onConfirm={async () => {
        setBusy(true);
        setErr(null);
        const res = await restoreLeadToPipeline({ leadId });
        setBusy(false);
        if (!res.ok) {
          setErr(res.error ?? "Erro ao restaurar.");
          return;
        }
        setOpen(false);
        router.refresh();
        router.push("/inbox?tab=leads");
      }}
    >
      <p className="text-xs font-medium text-[var(--foreground)]">Restaurar no funil</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Volta para a lista de leads e recria oportunidade no funil, se necessário.
      </p>
    </ActionPanel>
  );
}
