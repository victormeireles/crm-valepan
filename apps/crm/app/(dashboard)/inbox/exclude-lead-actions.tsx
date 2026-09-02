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
          className="rounded-md bg-[var(--vp-wine)] px-3 py-1 text-xs font-medium text-[var(--vp-gold)] disabled:opacity-50"
        >
          {busy ? "Salvando…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function ExcludeLeadButton({
  leadId,
  redirectTo = "/inbox?tab=archived",
  iconOnly = false,
}: {
  leadId: string;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
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
        className={iconOnly
          ? "grid size-[34px] place-items-center rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-ink-muted)] hover:text-[var(--vp-wine)]"
          : "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--vp-wine)] hover:text-[var(--vp-wine)]"}
        aria-label={iconOnly ? "Arquivar conversa" : undefined}
      >
        {iconOnly ? <span className="material-symbols-outlined text-lg" aria-hidden="true">archive</span> : "Não é lead"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(35,0,4,0.35)] p-4" role="dialog" aria-modal="true" aria-label="Arquivar conversa">
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
        router.push(redirectTo);
      }}
    >
      <p className="text-xs font-medium text-[var(--foreground)]">Arquivar conversa</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {reason === "cliente"
          ? "Sai do funil e entra na Carteira de Distribuidores com os dados já cadastrados."
          : "A conversa continua no WhatsApp, mas some da lista de prospects e do funil."}
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
      {reason === "cliente" ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Serão aproveitados rede, classificação, CNPJ, nome, telefone, cidade e status. Campos sem
          informação ficam disponíveis para completar na carteira.
        </p>
      ) : null}
    </ActionPanel>
    </div>
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
        router.push("/inbox?tab=qualify");
      }}
    >
      <p className="text-xs font-medium text-[var(--foreground)]">Restaurar para qualificar</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Esta conversa voltará para “Para qualificar”, onde deverá passar novamente pela
        qualificação.
      </p>
    </ActionPanel>
  );
}
