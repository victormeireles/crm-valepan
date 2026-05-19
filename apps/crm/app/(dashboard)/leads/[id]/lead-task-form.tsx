"use client";

import { createTask } from "@/app/actions/tasks";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadTaskForm({
  leadId,
  opportunityId,
  teamOptions,
  defaultAssigneeId,
  onCreated,
}: {
  leadId: string;
  opportunityId: string | null;
  teamOptions: { id: string; label: string }[];
  /** Quando definido (ex.: owner do lead), pré-seleciona o responsável da nova tarefa. */
  defaultAssigneeId: string | null;
  /** Ex.: fechar modal do chat após criar. */
  onCreated?: (title: string) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("lead_id", leadId);
    const title = String(fd.get("title") ?? "").trim();
    const res = await createTask(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    e.currentTarget.reset();
    if (defaultAssigneeId) {
      const sel = e.currentTarget.querySelector<HTMLSelectElement>('select[name="assignee_id"]');
      if (sel) sel.value = defaultAssigneeId;
    }
    router.refresh();
    onCreated?.(title);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="lead_id" value={leadId} />
      {opportunityId ? <input type="hidden" name="opportunity_id" value={opportunityId} /> : null}
      <input
        name="title"
        required
        placeholder="Título da tarefa"
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Prazo</span>
        <input
          name="due_at"
          type="date"
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Quem faz</span>
        <select
          name="assignee_id"
          defaultValue={defaultAssigneeId ?? ""}
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
        >
          <option value="">Eu (quem criar)</option>
          {teamOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Criando…" : "Criar tarefa"}
      </button>
    </form>
  );
}
