"use client";

import { createLeadNote } from "@/app/actions/notes";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("lead_id", leadId);
    const res = await createLeadNote(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 text-sm">
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Escreva uma nota..."
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2"
      />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Adicionar nota"}
      </button>
    </form>
  );
}
