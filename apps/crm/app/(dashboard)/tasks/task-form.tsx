"use client";

import { createTask } from "@/app/actions/tasks";
import { LeadPickerInput } from "@/components/lead-picker-input";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskForm() {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const leadId = String(fd.get("lead_id") ?? "").trim();
    if (!leadId) {
      setLoading(false);
      setErr("Selecione um lead na lista.");
      return;
    }
    const res = await createTask(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    e.currentTarget.reset();
    setFormKey((k) => k + 1);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
      <h2 className="font-medium">Nova tarefa</h2>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Lead</span>
        <LeadPickerInput
          key={formKey}
          required
          className="w-full rounded border border-[var(--border)] px-2 py-1"
        />
      </label>
      <input name="title" required placeholder="Título" className="rounded border border-[var(--border)] px-2 py-1" />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Prazo</span>
        <input name="due_at" type="date" className="rounded border border-[var(--border)] px-2 py-1" />
      </label>
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Criar"}
      </button>
    </form>
  );
}
