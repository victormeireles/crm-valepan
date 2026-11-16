"use client";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { CrmMenuSelect, type CrmMenuOption } from "@/components/crm-menu-select";
import { LeadDistributorSelect } from "@/components/lead-distributor-select";
import type { DistributorOption } from "@/lib/distributors";
import { distributorOptionsForSelect } from "@/lib/distributors";
import {
  canonicalPipelineStageKey,
  displayPipelineStageName,
  isLostPipelineStage,
} from "@/lib/pipeline-canonical-stages";
import {
  compactSubstageLabel,
  isForwardedToDistributorSubstage,
  substagesForStageKey,
  type PipelineSubstageDTO,
} from "@/lib/pipeline-substages";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type StageOption = { id: string; name: string; sortOrder: number; isFinal?: boolean };

const PIPELINE_VALUE_SEP = "::";

function encodePipelineValue(stageId: string, status: string) {
  if (!stageId) return "";
  return `${stageId}${PIPELINE_VALUE_SEP}${status}`;
}

function decodePipelineValue(value: string): { stageId: string; status: string } {
  if (!value) return { stageId: "", status: "" };
  const sep = value.indexOf(PIPELINE_VALUE_SEP);
  if (sep < 0) return { stageId: value, status: "" };
  return { stageId: value.slice(0, sep), status: value.slice(sep + PIPELINE_VALUE_SEP.length) };
}

function pipelineTriggerLabel(
  stageName: string | null | undefined,
  status: string,
  compact: boolean,
) {
  if (!stageName) return "Não definida";
  const stageLabel = displayPipelineStageName(stageName);
  if (!status) return stageLabel;
  const statusLabel = compact ? compactSubstageLabel(status) || status : status;
  return `${stageLabel} · ${statusLabel}`;
}

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
  const pipelineValue = encodePipelineValue(stageValue, statusValue);
  const compactToolbar = layout === "inline";

  const pipelineOptions = useMemo(() => {
    const options: CrmMenuOption[] = [{ value: "", label: "Não definida" }];
    for (const stage of orderedStages) {
      const group = displayPipelineStageName(stage.name);
      const statusOptions = substagesForStageKey(substages, stage.name, stage.id === stageValue ? statusValue : null);
      const statusRequired = isLostPipelineStage(stage.name);
      if (!statusRequired) {
        options.push({
          value: encodePipelineValue(stage.id, ""),
          label: "Sem status",
          group,
        });
      } else if (statusOptions.length === 0) {
        options.push({
          value: encodePipelineValue(stage.id, ""),
          label: "Selecione o status",
          group,
        });
      }
      for (const name of statusOptions) {
        options.push({
          value: encodePipelineValue(stage.id, name),
          label: name,
          group,
        });
      }
    }
    return options;
  }, [orderedStages, substages, stageValue, statusValue]);

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
  const showDistributor = Boolean(leadId && isForwardedToDistributorSubstage(statusValue));
  const triggerDisplay = pipelineTriggerLabel(selectedStage?.name, statusValue, compactToolbar);
  const triggerTitle = pipelineTriggerLabel(selectedStage?.name, statusValue, false);

  return (
    <div className={layout === "stack" ? "grid gap-2" : "flex flex-wrap items-center justify-end gap-1.5"}>
      <CrmMenuSelect
        label="Funil"
        portalRoot={portalRoot}
        variant={menuVariant}
        compact={compactToolbar}
        compactWide={compactToolbar}
        displayLabel={triggerDisplay}
        displayTitle={triggerTitle}
        value={pipelineValue}
        disabled={loading}
        options={pipelineOptions}
        onChange={(next) => {
          const decoded = decodePipelineValue(next);
          setStageValue(decoded.stageId);
          setStatusValue(decoded.status);
          void persist(decoded.stageId, decoded.status);
        }}
      />
      {showDistributor ? (
        <LeadDistributorSelect
          leadId={leadId!}
          options={distributorOptionsForSelect(
            distributors,
            distributorId ? { id: distributorId, name: distributorName?.trim() || "Distribuidor atual" } : null,
          )}
          distributorId={distributorId}
          onSaved={onDistributorSaved}
          appearance={menuVariant}
          portalRoot={portalRoot}
          wide={compactToolbar}
          compact={compactToolbar}
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
