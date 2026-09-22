"use client";

import {
  createOpportunityForLead,
  updateOpportunityDetails,
  updateOpportunityStage,
} from "@/app/actions/opportunity";
import { updateLeadClientCategory } from "@/app/actions/leads";
import { LeadDistributorSelect } from "@/components/lead-distributor-select";
import { distributorOptionsForSelect, type DistributorOption } from "@/lib/distributors";
import { LostReasonSelect } from "@/components/lost-reason-select";
import { ExcludeLeadButton } from "../../inbox/exclude-lead-actions";
import { isClientCategoryValue } from "@/lib/client-categories";
import type { LostReasonDTO } from "@/lib/lost-reasons";
import {
  canonicalPipelineStageKey,
  displayPipelineStageName,
  isLostPipelineStage,
} from "@/lib/pipeline-canonical-stages";
import { isForwardedToDistributorSubstage, substagesForStageKey } from "@/lib/pipeline-substages";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Stage = { id: string; name: string; sort_order: number; is_final?: boolean };
type Opp = {
  id: string;
  stage_id: string;
  lost_reason: string | null;
  title: string | null;
  pipeline_stages: { name: string } | null;
} | null;

export function LeadActions({
  leadId,
  clientCategory,
  distributorId,
  distributorName,
  distributors,
  contact,
  opportunity,
  stages,
  lostReasons,
}: {
  leadId: string;
  clientCategory: string | null;
  distributorId: string | null;
  distributorName: string;
  distributors: DistributorOption[];
  contact: { id: string; full_name: string | null } | null;
  opportunity: Opp;
  stages: Stage[];
  lostReasons: LostReasonDTO[];
}) {
  const router = useRouter();
  const [stageId, setStageId] = useState(opportunity?.stage_id ?? "");
  const [lost, setLost] = useState(opportunity?.lost_reason ?? "");
  const [title, setTitle] = useState(opportunity?.title ?? "");
  const [contactName, setContactName] = useState(contact?.full_name ?? "");
  const [loading, setLoading] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [category, setCategory] = useState(clientCategory ?? "");
  const [err, setErr] = useState<string | null>(null);

  const selectedStage = stages.find((s) => s.id === stageId);
  const closingStage = selectedStage && isLostPipelineStage(selectedStage.name) ? selectedStage : undefined;
  const statusNames = substagesForStageKey(
    lostReasons,
    selectedStage ? canonicalPipelineStageKey(selectedStage.name) : null,
    lost,
  );

  useEffect(() => {
    setCategory(clientCategory ?? "");
  }, [clientCategory]);

  const showDistributor = isForwardedToDistributorSubstage(lost) || Boolean(distributorId);
  const distributorField = showDistributor ? (
    <label className="flex flex-col gap-1">
      Distribuidor
      <LeadDistributorSelect
        leadId={leadId}
        options={distributorOptionsForSelect(
          distributors,
          distributorId ? { id: distributorId, name: distributorName || "Distribuidor atual" } : null,
        )}
        distributorId={distributorId}
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
      />
    </label>
  ) : null;

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
    const res = await updateOpportunityDetails({
      opportunityId: opportunity.id,
      title,
      contactId: contact?.id ?? null,
      contactName,
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
    try {
      const res = await updateOpportunityStage({
        opportunityId: opportunity.id,
        stageId,
        lostReason: lost.trim() || null,
      });
      if (!res.ok) {
        setErr(res.error ?? "Erro");
        return;
      }
      router.refresh();
    } catch {
      setErr("Não foi possível atualizar a etapa. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCategory() {
    setLoadingCategory(true);
    setErr(null);
    const trimmed = category.trim();
    const nextCategory = trimmed.length > 0 ? trimmed : null;
    if (nextCategory && !isClientCategoryValue(nextCategory)) {
      setLoadingCategory(false);
      setErr("Categoria inválida.");
      return;
    }
    try {
      const res = await updateLeadClientCategory({
        leadId,
        category: nextCategory,
      });
      if (!res.ok) {
        setErr(res.error ?? "Erro");
        return;
      }
      if (nextCategory) {
        router.push(`/leads?client_category=${encodeURIComponent(nextCategory)}`);
        return;
      }
      router.push("/leads");
    } catch {
      setErr("Não foi possível salvar a categoria. Tente novamente.");
    } finally {
      setLoadingCategory(false);
    }
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
        <hr className="border-[var(--border)]" />
        <label className="flex flex-col gap-1">
          Categorias de clientes
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">—</option>
            <option value="hamburgueria">hamburgueria</option>
            <option value="distribuidor">distribuidor</option>
            <option value="parceiros">parceiros</option>
            <option value="outros">outros</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void saveCategory()}
          disabled={loadingCategory}
          className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
        >
          {loadingCategory ? "Salvando…" : "Salvar categoria"}
        </button>
        {distributorField}
      </div>
    );
  }

  return (
    <div className="flex min-w-[260px] max-w-sm flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
      <div className="text-xs text-[var(--muted)]">
        Etapa atual: {displayPipelineStageName(opportunity.pipeline_stages?.name) || "—"}
      </div>
      <label className="flex flex-col gap-1">
        Nome do contato
        <input
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Nome do contato"
        />
      </label>
      <label className="flex flex-col gap-1">
        Título da oportunidade
        <input
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          onChange={(e) => {
            const next = e.target.value;
            setStageId(next);
            const stage = stages.find((item) => item.id === next);
            const options = substagesForStageKey(
              lostReasons,
              stage ? canonicalPipelineStageKey(stage.name) : null,
              "",
            );
            if (!options.includes(lost)) setLost("");
          }}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {displayPipelineStageName(s.name)}
            </option>
          ))}
        </select>
      </label>
      {statusNames.length > 0 || closingStage ? (
        <label className="flex flex-col gap-1">
          Status
          {lostReasons.some((reason) => reason.active && (!selectedStage || reason.stage_key === canonicalPipelineStageKey(selectedStage.name))) || lost.trim() ? (
            <LostReasonSelect
              reasons={lostReasons.filter((reason) =>
                selectedStage
                  ? canonicalPipelineStageKey(reason.stage_key) === canonicalPipelineStageKey(selectedStage.name)
                  : true,
              )}
              value={lost}
              onChange={setLost}
              className="min-h-11 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            />
          ) : (
            <p className="text-xs text-[var(--vp-error)]">
              Cadastre um status ativo em Configurações → Subetapas.
            </p>
          )}
        </label>
      ) : null}
      {distributorField}
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="button"
        onClick={() => void saveStage()}
        disabled={loading}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Atualizar etapa"}
      </button>

      <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5">
        <p className="text-xs font-medium text-[var(--foreground)]">Não é um lead?</p>
        <p className="mb-2 mt-1 text-[11px] text-[var(--muted)]">
          Sinalize para retirar este contato do funil e da lista de prospects.
        </p>
        <ExcludeLeadButton leadId={leadId} redirectTo="/pipeline" />
      </div>

      <hr className="border-[var(--border)]" />

      <label className="flex flex-col gap-1">
        Categorias de clientes
        <select
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">—</option>
          <option value="hamburgueria">hamburgueria</option>
          <option value="distribuidor">distribuidor</option>
          <option value="parceiros">parceiros</option>
          <option value="outros">outros</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => void saveCategory()}
        disabled={loadingCategory}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loadingCategory ? "Salvando…" : "Salvar categoria"}
      </button>
    </div>
  );
}
