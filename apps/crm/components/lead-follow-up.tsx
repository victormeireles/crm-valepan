"use client";

import { completeLeadFollowUp, saveLeadFollowUp } from "@/app/actions/follow-ups";
import { DEFAULT_FOLLOW_UP_TITLE, type LeadFollowUpDTO } from "@/lib/follow-ups";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TeamOption = { id: string; label: string };

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function suggestedDate(days: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  if (days === 0 && date.getTime() <= Date.now()) {
    date.setTime(Date.now() + 60 * 60 * 1_000);
    date.setMinutes(0, 0, 0);
  }
  return toDatetimeLocal(date.toISOString());
}

function formatFollowUpDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function LeadFollowUp({
  leadId,
  initialFollowUp,
  teamOptions,
  defaultAssigneeId,
  compact = false,
  onChange,
}: {
  leadId: string;
  initialFollowUp: LeadFollowUpDTO | null;
  teamOptions: TeamOption[];
  defaultAssigneeId: string | null;
  compact?: boolean;
  onChange?: (followUp: LeadFollowUpDTO | null) => void;
}) {
  const router = useRouter();
  const [followUp, setFollowUp] = useState(initialFollowUp);
  const [editing, setEditing] = useState(!initialFollowUp);
  const [title, setTitle] = useState(initialFollowUp?.title ?? "");
  const [dueAt, setDueAt] = useState(toDatetimeLocal(initialFollowUp?.due_at ?? null));
  const [assigneeId, setAssigneeId] = useState(initialFollowUp?.assignee_id ?? defaultAssigneeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFollowUp(initialFollowUp);
    setEditing(!initialFollowUp);
    setTitle(initialFollowUp?.title ?? "");
    setDueAt(toDatetimeLocal(initialFollowUp?.due_at ?? null));
    setAssigneeId(initialFollowUp?.assignee_id ?? defaultAssigneeId ?? "");
  }, [defaultAssigneeId, initialFollowUp]);

  function editCurrent() {
    setTitle(followUp?.title ?? "");
    setDueAt(toDatetimeLocal(followUp?.due_at ?? null));
    setAssigneeId(followUp?.assignee_id ?? defaultAssigneeId ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!dueAt) {
      setError("Escolha a data do follow-up.");
      return;
    }
    const parsed = new Date(dueAt);
    if (!Number.isFinite(parsed.getTime())) {
      setError("Escolha uma data válida para o follow-up.");
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      setError("Escolha uma data futura para o follow-up.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await saveLeadFollowUp({
      leadId,
      title: title.trim() || DEFAULT_FOLLOW_UP_TITLE,
      dueAt: parsed.toISOString(),
      assigneeId: assigneeId || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível salvar o follow-up.");
      return;
    }

    setFollowUp(result.followUp);
    setTitle(result.followUp.title);
    setDueAt(toDatetimeLocal(result.followUp.due_at));
    setAssigneeId(result.followUp.assignee_id ?? "");
    setEditing(false);
    onChange?.(result.followUp);
    router.refresh();
  }

  async function complete() {
    if (!followUp) return;
    setBusy(true);
    setError(null);
    const result = await completeLeadFollowUp(followUp.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível concluir o follow-up.");
      return;
    }

    setFollowUp(null);
    setTitle("");
    setDueAt("");
    setAssigneeId(defaultAssigneeId ?? "");
    setEditing(true);
    onChange?.(null);
    router.refresh();
  }

  const assigneeLabel = followUp?.assignee_id
    ? teamOptions.find((option) => option.id === followUp.assignee_id)?.label ?? "Responsável"
    : "Sem responsável";

  return (
    <section className={compact ? "text-xs" : "text-sm"}>
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">
        Follow-up
      </p>

      {followUp && !editing ? (
        <div className="rounded-xl border border-[rgba(199,166,77,0.5)] bg-[rgba(199,166,77,0.1)] p-3">
          <p className="whitespace-pre-wrap font-bold text-[var(--vp-wine)]">{followUp.title}</p>
          <p className="mt-1 text-[11px] text-[var(--vp-ink-muted)]">
            {formatFollowUpDate(followUp.due_at)} · {assigneeLabel}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void complete()}
              className="min-h-9 flex-1 rounded-full bg-[var(--vp-wine)] px-3 text-xs font-bold text-[var(--vp-gold)] disabled:opacity-50"
            >
              {busy ? "Concluindo…" : "Concluir follow-up"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={editCurrent}
              className="min-h-9 flex-1 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-ink-body)] disabled:opacity-50"
            >
              Reagendar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--vp-ink-muted)]">O que fazer</span>
            <textarea
              rows={compact ? 2 : 3}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Ligar para confirmar volume e tipo de pão"
              className="w-full resize-y rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-2.5 py-2 text-[13px] text-[var(--vp-ink-body)] outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-1.5" aria-label="Atalhos de data do follow-up">
            <button type="button" onClick={() => setDueAt(suggestedDate(0, 17))} className="rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--vp-wine)]">Hoje</button>
            <button type="button" onClick={() => setDueAt(suggestedDate(1, 9))} className="rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--vp-wine)]">Amanhã</button>
            <button type="button" onClick={() => setDueAt(suggestedDate(3, 9))} className="rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--vp-wine)]">+3 dias</button>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--vp-ink-muted)]">Data do follow-up</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-2.5 text-[13px] text-[var(--vp-ink-body)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[var(--vp-ink-muted)]">Responsável</span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-2.5 text-[13px] text-[var(--vp-ink-body)]"
            >
              <option value="">Responsável do lead (ou eu)</option>
              {teamOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          {error ? <p className="text-[11px] text-[var(--vp-error)]" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-9 flex-1 rounded-full bg-[var(--vp-wine)] px-3 text-xs font-bold text-[var(--vp-gold)] disabled:opacity-50"
            >
              {busy ? "Salvando…" : followUp ? "Salvar follow-up" : "Agendar follow-up"}
            </button>
            {followUp ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
                className="min-h-9 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-ink-body)] disabled:opacity-50"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      )}

      {error && followUp && !editing ? (
        <p className="mt-2 text-[11px] text-[var(--vp-error)]" role="alert">{error}</p>
      ) : null}
    </section>
  );
}
