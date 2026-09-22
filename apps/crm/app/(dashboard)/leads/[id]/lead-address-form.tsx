"use client";

import { lookupLeadCep, updateLeadAddress } from "@/app/actions/leads";
import { formatCaptureZip } from "@/lib/lead-capture";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AddressDraft = {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function LeadAddressForm(props: {
  leadId: string;
  zipCode: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AddressDraft>({
    zipCode: formatCaptureZip(props.zipCode ?? ""),
    street: props.street ?? "",
    neighborhood: props.neighborhood ?? "",
    city: props.city ?? "",
    state: props.state ?? "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(next: Partial<AddressDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function onZipChange(raw: string) {
    const formatted = formatCaptureZip(raw);
    patch({ zipCode: formatted });
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) {
      setStatus(null);
      return;
    }
    setStatus("Buscando CEP…");
    setError(null);
    const result = await lookupLeadCep(digits);
    if (!result.ok) {
      setStatus(null);
      setError(result.error);
      return;
    }
    const next = {
      zipCode: formatCaptureZip(result.address.zipCode),
      street: result.address.street ?? "",
      neighborhood: result.address.neighborhood ?? "",
      city: result.address.city,
      state: result.address.state,
    };
    patch(next);
    setSaving(true);
    const saved = await updateLeadAddress({
      leadId: props.leadId,
      zipCode: next.zipCode,
      street: next.street || null,
      neighborhood: next.neighborhood || null,
      city: next.city,
      state: next.state,
    });
    setSaving(false);
    if (!saved.ok) {
      setError(saved.error);
      setStatus(null);
      return;
    }
    setStatus("Endereço encontrado e salvo.");
    router.refresh();
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    const result = await updateLeadAddress({
      leadId: props.leadId,
      zipCode: draft.zipCode || null,
      street: draft.street || null,
      neighborhood: draft.neighborhood || null,
      city: draft.city || null,
      state: draft.state || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus("Endereço salvo.");
    router.refresh();
  }

  const fieldClass = "rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:col-span-2">
      <h2 className="text-sm font-medium">Endereço</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          CEP
          <input className={fieldClass} value={draft.zipCode} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" onChange={(event) => void onZipChange(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Logradouro
          <input className={fieldClass} value={draft.street} onChange={(event) => patch({ street: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Bairro
          <input className={fieldClass} value={draft.neighborhood} onChange={(event) => patch({ neighborhood: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Cidade
          <input className={fieldClass} value={draft.city} onChange={(event) => patch({ city: event.target.value })} />
        </label>
        <label className="flex max-w-28 flex-col gap-1 text-xs text-[var(--muted)]">
          UF
          <input className={fieldClass} value={draft.state} maxLength={2} onChange={(event) => patch({ state: event.target.value.toUpperCase() })} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void onSave()} disabled={saving} className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--vp-gold)] disabled:opacity-50">
          {saving ? "Salvando…" : "Salvar endereço"}
        </button>
        {status ? <p className="text-xs text-[var(--muted)]">{status}</p> : null}
        {error ? <p className="text-xs text-[var(--vp-error)]">{error}</p> : null}
      </div>
    </div>
  );
}
