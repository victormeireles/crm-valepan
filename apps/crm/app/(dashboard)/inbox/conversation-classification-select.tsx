"use client";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { LeadDistributorSelect } from "@/components/lead-distributor-select";
import type { DistributorOption } from "@/lib/distributors";
import { distributorOptionsForSelect } from "@/lib/distributors";
import {
  canonicalPipelineStageKey,
  displayPipelineStageName,
  isLostPipelineStage,
} from "@/lib/pipeline-canonical-stages";
import {
  isForwardedToDistributorSubstage,
  substagesForStageKey,
  type PipelineSubstageDTO,
} from "@/lib/pipeline-substages";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type StageOption = { id: string; name: string; sortOrder: number; isFinal?: boolean };

export function ConversationPipelineSelect({
  conversationId,
  leadId,
  stages,
  substages,
  distributors,
  stageId,
  substage,
  distributorId,
  distributorName,
  onSaved,
  onDistributorSaved,
}: {
  conversationId: string;
  leadId: string | null;
  stages: StageOption[];
  substages: PipelineSubstageDTO[];
  distributors: DistributorOption[];
  stageId: string | null;
  substage: string | null;
  distributorId: string | null;
  distributorName: string | null;
  onSaved?: (next: { stageId: string | null; substage: string | null }) => void;
  onDistributorSaved?: (distributorId: string | null) => void;
}) {
  const router = useRouter();
  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [stages],
  );
  const [stageValue, setStageValue] = useState(stageId ?? "");
  const [statusValue, setStatusValue] = useState(substage ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStageValue(stageId ?? "");
  }, [stageId]);
  useEffect(() => {
    setStatusValue(substage ?? "");
  }, [substage]);

  const selectedStage = orderedStages.find((stage) => stage.id === stageValue) ?? null;
  const statusOptions = substagesForStageKey(substages, selectedStage?.name ?? null, statusValue);
  const statusRequired = isLostPipelineStage(selectedStage?.name);

  async function persist(nextStageId: string, nextStatus: string) {
    const stage = orderedStages.find((item) => item.id === nextStageId) ?? null;
    const options = substagesForStageKey(substages, stage?.name ?? null, nextStatus);
    const compatibleStatus = options.includes(nextStatus) ? nextStatus : "";
    if (isLostPipelineStage(stage?.name) && !compatibleStatus) {
      setStatusValue("");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await updateConversationPipelineClassification({
        conversationId,
        stageId: nextStageId || null,
        substage: compatibleStatus || null,
      });
      if (!res.ok) {
        setErr(res.error ?? "Erro");
        setStageValue(stageId ?? "");
        setStatusValue(substage ?? "");
        return;
      }
      setStageValue(res.stageId ?? "");
      setStatusValue(res.substage ?? "");
      onSaved?.({ stageId: res.stageId, substage: res.substage });
      router.refresh();
    } catch {
      setErr("Não foi possível salvar. Tente novamente.");
      setStageValue(stageId ?? "");
      setStatusValue(substage ?? "");
    } finally {
      setLoading(false);
    }
  }

  const controlClass =
    "min-w-[9.5rem] rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1.5 text-xs text-[var(--foreground)]";

  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <label className="flex flex-col items-end gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
          Etapa
        </span>
        <select
          value={stageValue}
          disabled={loading}
          onChange={(event) => {
            const next = event.target.value;
            const stage = orderedStages.find((item) => item.id === next) ?? null;
            const nextOptions = substagesForStageKey(substages, stage?.name ?? null, "");
            const nextStatus = nextOptions.includes(statusValue) ? statusValue : "";
            setStageValue(next);
            setStatusValue(nextStatus);
            void persist(next, nextStatus);
          }}
          className={controlClass}
        >
          <option value="">Não definida</option>
          {orderedStages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {displayPipelineStageName(stage.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col items-end gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
          Status
        </span>
        <select
          value={statusValue}
          disabled={loading || !stageValue || statusOptions.length === 0}
          onChange={(event) => {
            const next = event.target.value;
            setStatusValue(next);
            void persist(stageValue, next);
          }}
          className={controlClass}
        >
          <option value="">{statusRequired ? "Selecione o status" : "Sem status"}</option>
          {statusOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {leadId && isForwardedToDistributorSubstage(statusValue) ? (
        <label className="flex flex-col items-end gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
            Distribuidor
          </span>
          <LeadDistributorSelect
            leadId={leadId}
            options={distributorOptionsForSelect(
              distributors,
              distributorId ? { id: distributorId, name: distributorName?.trim() || "Distribuidor atual" } : null,
            )}
            distributorId={distributorId}
            onSaved={onDistributorSaved}
            className={controlClass}
          />
        </label>
      ) : null}
      {err ? <p className="basis-full text-right text-[11px] text-[var(--vp-error)]">{err}</p> : null}
    </div>
  );
}

export function stageKeyOf(stages: StageOption[], stageId: string | null | undefined) {
  const stage = stages.find((item) => item.id === stageId);
  return stage ? canonicalPipelineStageKey(stage.name) : "";
}
