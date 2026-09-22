"use client";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { CrmMenuSelect } from "@/components/crm-menu-select";
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
  layout = "inline",
  portalRoot = null,
  skipRefresh = false,
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
  layout?: "inline" | "stack";
  portalRoot?: HTMLElement | null;
  skipRefresh?: boolean;
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
      if (!skipRefresh) router.refresh();
    } catch {
      setErr("Não foi possível salvar. Tente novamente.");
      setStageValue(stageId ?? "");
      setStatusValue(substage ?? "");
    } finally {
      setLoading(false);
    }
  }

  const menuVariant = layout === "stack" ? "row" : "toolbar";

  return (
    <div className={layout === "stack" ? "grid gap-2" : "flex flex-wrap items-center justify-end gap-2"}>
      <CrmMenuSelect
        label="Etapa"
        portalRoot={portalRoot}
        variant={menuVariant}
        value={stageValue}
        disabled={loading}
        options={[
          { value: "", label: "Não definida" },
          ...orderedStages.map((stage) => ({
            value: stage.id,
            label: displayPipelineStageName(stage.name),
          })),
        ]}
        onChange={(next) => {
          const stage = orderedStages.find((item) => item.id === next) ?? null;
          const nextOptions = substagesForStageKey(substages, stage?.name ?? null, "");
          const nextStatus = nextOptions.includes(statusValue) ? statusValue : "";
          setStageValue(next);
          setStatusValue(nextStatus);
          void persist(next, nextStatus);
        }}
      />
      <CrmMenuSelect
        label="Status"
        portalRoot={portalRoot}
        variant={menuVariant}
        value={statusValue}
        disabled={loading || !stageValue || statusOptions.length === 0}
        options={[
          { value: "", label: statusRequired ? "Selecione o status" : "Sem status" },
          ...statusOptions.map((name) => ({ value: name, label: name })),
        ]}
        onChange={(next) => {
          setStatusValue(next);
          void persist(stageValue, next);
        }}
      />
      {leadId && isForwardedToDistributorSubstage(statusValue) ? (
        <LeadDistributorSelect
          leadId={leadId}
          options={distributorOptionsForSelect(
            distributors,
            distributorId ? { id: distributorId, name: distributorName?.trim() || "Distribuidor atual" } : null,
          )}
          distributorId={distributorId}
          onSaved={onDistributorSaved}
          appearance={menuVariant}
          portalRoot={portalRoot}
        />
      ) : null}
      {err ? (
        <p role="alert" className={layout === "stack" ? "text-xs text-[var(--vp-error)]" : "basis-full text-right text-[11px] text-[var(--vp-error)]"}>
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function stageKeyOf(stages: StageOption[], stageId: string | null | undefined) {
  const stage = stages.find((item) => item.id === stageId);
  return stage ? canonicalPipelineStageKey(stage.name) : "";
}
