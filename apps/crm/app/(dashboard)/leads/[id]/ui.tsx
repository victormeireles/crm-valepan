"use client";

import {
  createOpportunityForLead,
  updateOpportunityDetails,
  updateOpportunityStage,
} from "@/app/actions/opportunity";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Stage = { id: string; name: string; sort_order: number };
type Opp = {
  id: string;
  stage_id: string;
  lost_reason: string | null;
  title: string | null;
  next_action_at: string | null;
  pipeline_stages: { name: string } | null;
} | null;

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadActions({
  leadId,
  opportunity,
  stages,
}: {
  leadId: string;
  opportunity: Opp;
  stages: Stage[];
}) {
  const router = useRouter();
  const [stageId, setStageId] = useState(opportunity?.stage_id ?? "");
  const [lost, setLost] = useState(opportunity?.lost_reason ?? "");
  const [title, setTitle] = useState(opportunity?.title ?? "");
  const [nextAt, setNextAt] = useState(toDatetimeLocalValue(opportunity?.next_action_at ?? null));
  const [loading, setLoading] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lostStage = stages.find((s) => s.name.toLowerCase().includes("perdido"));

  async function createOpp() {
    setLoadingCreate(true);
    setErr(null);
    const res = await createOpportunityForLead(leadId);
    setLoadingCreate(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  async function saveMeta() {
    if (!opportunity?.id) return;
    setLoadingMeta(true);
    setErr(null);
    const nextActionAt =
      nextAt.trim().length > 0 ? new Date(nextAt).toISOString() : null;
    const res = await updateOpportunityDetails({
      opportunityId: opportunity.id,
      title,
      nextActionAt,
    });
    setLoadingMeta(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  async function saveStage() {
    if (!opportunity?.id) {
      setErr("Sem oportunidade vinculada.");
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await updateOpportunityStage({
      opportunityId: opportunity.id,
      stageId,
      lostReason: lostStage && stageId === lostStage.id ? lost : null,
    });
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  if (!opportunity) {
    return (
      <div className="flex min-w-[240px] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
        <p className="text-xs text-[var(--muted)]">Nenhuma oportunidade neste lead.</p>
        {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
        <button
          type="button"
          onClick={() => void createOpp()}
          disabled={loadingCreate}
          className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
        >
          {loadingCreate ? "Criando…" : "Criar oportunidade"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-[260px] max-w-sm flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
      <div className="text-xs text-[var(--muted)]">
        Etapa atual: {opportunity.pipeline_stages?.name ?? "—"}
      </div>
      <label className="flex flex-col gap-1">
        Título da oportunidade
        <input
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Próxima ação
        <input
          type="datetime-local"
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={nextAt}
          onChange={(e) => setNextAt(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() => void saveMeta()}
        disabled={loadingMeta}
        className="rounded border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--background)] disabled:opacity-50"
      >
        {loadingMeta ? "Salvando…" : "Salvar dados"}
      </button>

      <hr className="border-[var(--border)]" />

      <label className="flex flex-col gap-1">
        Mover para etapa
        <select
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {lostStage && stageId === lostStage.id ? (
        <label className="flex flex-col gap-1">
          Motivo (perdido)
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={lost}
            onChange={(e) => setLost(e.target.value)}
            placeholder="Obrigatório para etapa Perdido"
          />
        </label>
      ) : null}
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="button"
        onClick={() => void saveStage()}
        disabled={loading}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Atualizar etapa"}
      </button>
    </div>
  );
}
