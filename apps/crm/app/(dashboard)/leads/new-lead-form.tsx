"use client";

import { createLead } from "@/app/actions/leads";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewLeadForm({
  categoryMode = null,
}: {
  categoryMode?: "hamburgueria" | "distribuidor" | "parceiros" | "outros" | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await createLead(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao criar lead");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
    >
      {categoryMode ? (
        <>
          <input type="hidden" name="source" value="manual" />
          <input type="hidden" name="client_category" value={categoryMode} />
          {categoryMode === "distribuidor" ? (
            <label className="flex min-w-[200px] flex-col gap-1">
              Rede
              <input
                name="distributor_name"
                required
                placeholder="Digite a rede"
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              />
            </label>
          ) : null}
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            Nome
            <input
              name="contact_name"
              required={categoryMode === "distribuidor"}
              placeholder="Nome do contato"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            Telefone
            <input
              name="phone"
              required
              placeholder="(11) 99999-9999"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            Rede
            <input
              name="source"
              defaultValue="manual"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            Nome
            <input
              name="contact_name"
              placeholder="Nome do contato"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            Telefone
            <input
              name="phone"
              required
              placeholder="(11) 99999-9999"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          </label>
        </>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "INCLUINDO..." : categoryMode ? "INCLUIR" : "Novo lead"}
      </button>
      {err ? <p className="w-full text-xs text-[var(--vp-error)]">{err}</p> : null}
    </form>
  );
}
