"use client";

import { createSample } from "@/app/actions/samples";
import { SEND_VIA_OPTIONS } from "@/lib/send-via-options";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SampleForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await createSample(fd);
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
      <h2 className="font-medium">Nova solicitação de amostra</h2>
      <select name="send_via" className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1">
        <option value="">Enviar por</option>
        {SEND_VIA_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <input name="network" placeholder="Rede" className="rounded border border-[var(--border)] px-2 py-1" />
      <input name="contact_name" placeholder="Nome" className="rounded border border-[var(--border)] px-2 py-1" />
      <input name="address_line" placeholder="Endereço" className="rounded border border-[var(--border)] px-2 py-1" />
      <input
        name="business_hours"
        placeholder="Horário de funcionamento"
        className="rounded border border-[var(--border)] px-2 py-1"
      />
      <input name="bread_type" required placeholder="Tipo de pão" className="rounded border border-[var(--border)] px-2 py-1" />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Registrar"}
      </button>
    </form>
  );
}
