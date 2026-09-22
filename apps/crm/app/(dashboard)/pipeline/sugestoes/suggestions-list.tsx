"use client";

import {
  resolvePipelineAdvanceSuggestion,
  runPipelineAdvanceJobNow,
  type PipelineAdvanceSuggestionDTO,
  type PipelineClassificationCatalog,
} from "@/app/actions/pipeline-advance";
import { PipelineConversationPeek } from "@/app/(dashboard)/pipeline/pipeline-conversation-peek";
import { CrmMenuSelect } from "@/components/crm-menu-select";
import { LeadDistributorSelect } from "@/components/lead-distributor-select";
import { distributorOptionsForSelect } from "@/lib/distributors";
import { displayPipelineStageName, isLostPipelineStage } from "@/lib/pipeline-canonical-stages";
import { pipelineConversationPeekTarget, type PipelineConversationPeekTarget } from "@/lib/pipeline-conversation-peek";
import { isForwardedToDistributorSubstage, substagesForStageKey } from "@/lib/pipeline-substages";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const quietBtn =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)] hover:text-[var(--vp-wine)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-[var(--vp-wine)] px-4 text-sm font-bold text-[var(--vp-gold)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

function formatStageSubstage(stageName: string, substage: string | null | undefined): string {
  const stage = displayPipelineStageName(stageName);
  const extra = (substage ?? "").trim();
  return extra ? `${stage} · ${extra}` : stage;
}

function SuggestionCard({
  item,
  catalog,
  busy,
  onPeek,
  onResolve,
}: {
  item: PipelineAdvanceSuggestionDTO;
  catalog: PipelineClassificationCatalog | null;
  busy: boolean;
  onPeek: () => void;
  onResolve: (action: "accept" | "dismiss", stageId?: string, substage?: string | null) => void;
}) {
  const stages = useMemo(
    () => [...(catalog?.stages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog?.stages],
  );
  const [stageId, setStageId] = useState(item.toStageId);
  const [statusValue, setStatusValue] = useState(item.toSubstage ?? "");

  useEffect(() => {
    setStageId(item.toStageId);
    setStatusValue(item.toSubstage ?? "");
  }, [item.id, item.toStageId, item.toSubstage]);

  const selectedStage = stages.find((stage) => stage.id === stageId) ?? null;
  const statusOptions = substagesForStageKey(catalog?.substages ?? [], selectedStage?.name ?? null, statusValue);
  const statusRequired = isLostPipelineStage(selectedStage?.name);
  const matchesSuggestion =
    stageId === item.toStageId && statusValue.trim() === (item.toSubstage ?? "").trim();
  const canConfirm = Boolean(stageId) && (!statusRequired || Boolean(statusValue));

  const fromStage = displayPipelineStageName(item.fromStageName);

  return (
    <li className="rounded-2xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-4 py-3 shadow-[var(--sh-sm)] sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-[var(--vp-ink-body)]">{item.personName}</p>
          {item.companyLine ? (
            <p className="truncate text-xs text-[var(--vp-ink-muted)]">{item.companyLine}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center text-xs font-bold text-[var(--vp-wine)] underline-offset-2 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={onPeek}
        >
          Ver conversa
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Destino sugerido">
        <span className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full bg-[var(--vp-surface)] px-3 text-[13px]">
          <span className="font-semibold text-[var(--vp-ink-muted)]">{fromStage || "Sem etapa"}</span>
          {item.fromSubstage ? (
            <span className="truncate text-[var(--vp-ink-soft)]">· {item.fromSubstage}</span>
          ) : null}
        </span>
        <span aria-hidden className="text-sm text-[var(--vp-ink-soft)]">→</span>
        {catalog ? (
          <>
            <CrmMenuSelect
              label="Etapa"
              variant="toolbar"
              align="start"
              wide
              value={stageId}
              disabled={busy}
              options={stages.map((stage) => ({
                value: stage.id,
                label: displayPipelineStageName(stage.name),
              }))}
              onChange={(next) => {
                const stage = stages.find((itemStage) => itemStage.id === next) ?? null;
                const nextOptions = substagesForStageKey(catalog.substages, stage?.name ?? null, "");
                setStageId(next);
                setStatusValue(nextOptions.includes(statusValue) ? statusValue : "");
              }}
            />
            <CrmMenuSelect
              label="Status"
              variant="toolbar"
              align="start"
              wide
              value={statusValue}
              disabled={busy || !stageId || statusOptions.length === 0}
              options={[
                { value: "", label: statusRequired ? "Selecione o status" : "Sem status" },
                ...statusOptions.map((name) => ({ value: name, label: name })),
              ]}
              onChange={setStatusValue}
            />
            {isForwardedToDistributorSubstage(statusValue) ? (
              <LeadDistributorSelect
                leadId={item.leadId}
                wide
                options={distributorOptionsForSelect(
                  catalog.distributors,
                  item.distributorId
                    ? { id: item.distributorId, name: item.distributorName?.trim() || "Distribuidor atual" }
                    : null,
                )}
                distributorId={item.distributorId}
                appearance="toolbar"
                emptyLabel="Escolher distribuidor"
              />
            ) : null}
          </>
        ) : (
          <strong className="text-sm text-[var(--vp-wine)]">
            {formatStageSubstage(item.toStageName, item.toSubstage)}
          </strong>
        )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" className={quietBtn} disabled={busy} onClick={() => onResolve("dismiss")}>
            Ignorar
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={busy || !canConfirm}
            onClick={() => onResolve("accept", stageId, statusValue || null)}
          >
            {busy ? "Salvando…" : matchesSuggestion ? "Aceitar" : "Classificar"}
          </button>
        </div>
      </div>
      {statusRequired && !statusValue ? (
        <p className="mt-2 text-xs text-[var(--vp-ink-muted)]">Escolha o status de perda para classificar.</p>
      ) : null}

      {item.rationale ? (
        <p className="mt-2 text-sm leading-snug text-[var(--vp-ink-body)]">{item.rationale}</p>
      ) : null}
      {item.evidenceQuote ? (
        <p className="mt-1 border-l-2 border-[var(--vp-gold)] pl-3 text-sm leading-snug text-[var(--vp-ink-muted)]">
          {item.evidenceQuote}
        </p>
      ) : null}
    </li>
  );
}

export function PipelineAdvanceSuggestionsList({
  items,
  canRunJob,
  catalog,
}: {
  items: PipelineAdvanceSuggestionDTO[];
  canRunJob: boolean;
  catalog: PipelineClassificationCatalog | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobNote, setJobNote] = useState<string | null>(null);
  const [peek, setPeek] = useState<PipelineConversationPeekTarget | null>(null);

  async function resolve(
    id: string,
    action: "accept" | "dismiss",
    stageId?: string,
    substage?: string | null,
  ) {
    setPendingId(id);
    setError(null);
    const result = await resolvePipelineAdvanceSuggestion({ id, action, stageId, substage });
    setPendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function runJob() {
    setRunning(true);
    setError(null);
    setJobNote(null);
    const result = await runPipelineAdvanceJobNow();
    setRunning(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const suggestionLabel = result.suggested === 1 ? "sugestão" : "sugestões";
    const autoLabel = result.autoApplied === 1 ? "regra automática" : "regras automáticas";
    const qualifiedLabel = result.qualified === 1 ? "ficha" : "fichas";
    setJobNote(
      `Analisadas ${result.scanned} conversas · ${result.suggested} ${suggestionLabel} · ${result.autoApplied} ${autoLabel} · ${result.skipped} sem avanço · ${result.qualified} ${qualifiedLabel}.`,
    );
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vp-ink-muted)]">
            <Link href="/pipeline" className="hover:underline">
              Funil
            </Link>
            <span> / Sugestões</span>
          </p>
          <h1
            className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Avançar no funil
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <p className="px-1 text-sm tabular-nums text-[var(--vp-ink-muted)]">
            {items.length === 1 ? "1 pendente" : `${items.length} pendentes`}
          </p>
          {canRunJob ? (
            <button type="button" className={quietBtn} disabled={running} onClick={() => void runJob()}>
              {running ? "Analisando…" : "Atualizar agora"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-[rgba(186,26,26,0.25)] bg-[rgba(186,26,26,0.08)] px-4 py-3 text-sm text-[var(--vp-error)]">
          {error}
        </p>
      ) : null}
      {jobNote ? <p className="text-sm text-[var(--vp-ink-muted)]">{jobNote}</p> : null}
      {items.length === 0 ? (
        <p className="rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-4 py-10 text-center text-sm text-[var(--vp-ink-muted)]">
          Nenhuma sugestão pendente. O job só lê conversas em que o cliente já respondeu e nunca recua etapa.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <SuggestionCard
              key={item.id}
              item={item}
              catalog={catalog}
              busy={pendingId === item.id}
              onPeek={() => setPeek(pipelineConversationPeekTarget(item.conversationId, item.personName))}
              onResolve={(action, stageId, substage) => void resolve(item.id, action, stageId, substage)}
            />
          ))}
        </ul>
      )}
      <PipelineConversationPeek target={peek} catalog={catalog} onClose={() => setPeek(null)} />
    </div>
  );
}
