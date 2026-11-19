"use client";

import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { MobileSheet } from "@/components/mobile-sheet";
import { CrmIcon } from "@/components/crm-icon";
import { displayPipelineStageName, isLostPipelineStage } from "@/lib/pipeline-canonical-stages";
import { compactSubstageLabel, substagesForStageKey, type PipelineSubstageDTO } from "@/lib/pipeline-substages";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ForwardDistributorByCepButton } from "./forward-distributor-by-cep";

type StageOption = { id: string; name: string; sortOrder: number; isFinal?: boolean };

export function formatFunnelValue(stageName: string | null | undefined, substage: string | null | undefined) {
  const stageLabel = displayPipelineStageName(stageName) || "Não definida";
  const status = (substage ?? "").trim();
  if (!status) return stageLabel;
  return `${stageLabel} · ${compactSubstageLabel(status) || status}`;
}

export function InboxStageSheet({
  open,
  onClose,
  conversationId,
  leadId,
  contactName,
  stages,
  substages,
  stageId,
  substage,
  zipCode,
  onSaved,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  leadId: string | null;
  contactName: string;
  stages: StageOption[];
  substages: PipelineSubstageDTO[];
  stageId: string | null;
  substage: string | null;
  zipCode: string | null;
  onSaved: (next: { stageId: string | null; substage: string | null }) => void;
  onAssigned: (next: {
    stageId: string;
    substage: string;
    distributorId: string;
    distributorName: string;
    zipCode: string;
  }) => void;
}) {
  const router = useRouter();
  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [stages],
  );
  const [stageValue, setStageValue] = useState(stageId ?? "");
  const [statusValue, setStatusValue] = useState(substage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStageValue(stageId ?? "");
    setStatusValue(substage ?? "");
    setError(null);
  }, [open, stageId, substage]);

  const selectedStage = orderedStages.find((stage) => stage.id === stageValue) ?? null;
  const statusOptions = substagesForStageKey(substages, selectedStage?.name ?? null, statusValue);

  async function persist(nextStageId: string, nextStatus: string) {
    const stage = orderedStages.find((item) => item.id === nextStageId) ?? null;
    const options = substagesForStageKey(substages, stage?.name ?? null, nextStatus);
    const compatibleStatus = options.includes(nextStatus) ? nextStatus : "";
    if (isLostPipelineStage(stage?.name) && !compatibleStatus) {
      setStatusValue("");
      return;
    }
    const previous = { stageId: stageId ?? "", substage: substage ?? "" };
    setStageValue(nextStageId);
    setStatusValue(compatibleStatus);
    onSaved({ stageId: nextStageId || null, substage: compatibleStatus || null });
    setSaving(true);
    setError(null);
    try {
      const res = await updateConversationPipelineClassification({
        conversationId,
        stageId: nextStageId || null,
        substage: compatibleStatus || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível salvar.");
        setStageValue(previous.stageId);
        setStatusValue(previous.substage);
        onSaved({ stageId: previous.stageId || null, substage: previous.substage || null });
        return;
      }
      setStageValue(res.stageId ?? "");
      setStatusValue(res.substage ?? "");
      onSaved({ stageId: res.stageId, substage: res.substage });
      router.refresh();
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
      setStageValue(previous.stageId);
      setStatusValue(previous.substage);
      onSaved({ stageId: previous.stageId || null, substage: previous.substage || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileSheet
      open={open}
      label="Funil"
      title="Etapa e status"
      subtitle={`${contactName} · salva ao tocar`}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {leadId ? (
            <ForwardDistributorByCepButton
              conversationId={conversationId}
              leadId={leadId}
              initialZipCode={zipCode}
              appearance="outline"
              onAssigned={(next) => {
                onAssigned(next);
                setStageValue(next.stageId);
                setStatusValue(next.substage);
              }}
            />
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[52px] w-[120px] shrink-0 items-center justify-center rounded-xl bg-[var(--vp-wine)] text-sm font-bold text-[var(--vp-gold)]"
          >
            Pronto
          </button>
        </div>
      }
    >
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          {orderedStages.map((stage) => {
            const active = stage.id === stageValue;
            return (
              <button
                key={stage.id}
                type="button"
                disabled={saving}
                onClick={() => {
                  const options = substagesForStageKey(substages, stage.name, statusValue);
                  const nextStatus = options.includes(statusValue) ? statusValue : "";
                  setStageValue(stage.id);
                  setStatusValue(nextStatus);
                  void persist(stage.id, nextStatus);
                }}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold disabled:opacity-60 ${
                  active
                    ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                    : "bg-[var(--vp-surface)] text-[var(--vp-ink-muted)]"
                }`}
              >
                {displayPipelineStageName(stage.name)}
              </button>
            );
          })}
        </div>
        <p className="mb-2 mt-5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--vp-gold-deep)]">Status</p>
        <div className="overflow-hidden rounded-xl border border-[var(--vp-ink-line)]">
          {statusOptions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--vp-ink-muted)]">Esta etapa não tem status.</p>
          ) : (
            statusOptions.map((status) => {
              const selected = status === statusValue;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={saving || !stageValue}
                  onClick={() => void persist(stageValue, status)}
                  className="flex min-h-[52px] w-full items-center gap-3 border-b border-[var(--vp-surface-high)] px-4 text-left text-sm font-semibold text-[var(--vp-ink-body)] last:border-b-0 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1 truncate">{status}</span>
                  {selected ? <CrmIcon name="check" className="shrink-0 text-[20px] text-[var(--vp-wine)]" /> : null}
                </button>
              );
            })
          )}
        </div>
        {error ? <p role="alert" className="mt-3 text-xs text-[var(--vp-error)]">{error}</p> : null}
      </div>
    </MobileSheet>
  );
}
