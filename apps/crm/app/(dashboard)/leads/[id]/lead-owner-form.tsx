"use client";

import { updateLeadOwner } from "@/app/actions/leads";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadOwnerForm({
  leadId,
  ownerId,
  teamOptions,
}: {
  leadId: string;
  ownerId: string | null;
  teamOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value.trim();
    const next = raw.length === 0 ? null : raw;
    setBusy(true);
    setErr(null);
    const res = await updateLeadOwner({ leadId, ownerId: next });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao salvar");
      e.target.value = ownerId ?? "";
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--muted)]">Responsável pelo lead</label>
      <select
        key={ownerId ?? "none"}
        disabled={busy}
        defaultValue={ownerId ?? ""}
        onChange={(e) => void onChange(e)}
        className="max-w-md rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
      >
        <option value="">Sem responsável</option>
        {teamOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <p className="text-[11px] text-[var(--muted)]">
        As oportunidades ligadas a este lead passam a ter o mesmo responsável.
      </p>
    </div>
  );
}
