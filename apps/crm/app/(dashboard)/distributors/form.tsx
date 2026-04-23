"use client";

import { createDistributor } from "@/app/actions/distributors";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DistributorForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await createDistributor(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-lg flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm"
    >
      <h2 className="font-medium">Novo distribuidor</h2>
      <input name="name" required placeholder="Nome" className="rounded border border-[var(--border)] px-2 py-1" />
      <input name="region" placeholder="Região (opcional)" className="rounded border border-[var(--border)] px-2 py-1" />
      <input name="state" placeholder="UF (opcional)" className="rounded border border-[var(--border)] px-2 py-1" />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
