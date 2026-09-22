"use client";

import {
  resolvePipelineAdvanceSuggestion,
  runPipelineAdvanceJobNow,
  type PipelineAdvanceSuggestionDTO,
} from "@/app/actions/pipeline-advance";
import { PipelineConversationPeek } from "@/app/(dashboard)/pipeline/pipeline-conversation-peek";
import { displayPipelineStageName } from "@/lib/pipeline-canonical-stages";
import { pipelineConversationPeekTarget, type PipelineConversationPeekTarget } from "@/lib/pipeline-conversation-peek";
import { useRouter } from "next/navigation";
import { useState } from "react";

const actionBtn =
  "rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2.5 py-1.5 text-xs font-semibold text-[var(--vp-wine)] hover:bg-[var(--background)] disabled:opacity-50";

function formatStageSubstage(stageName: string, substage: string | null | undefined): string {
  const stage = displayPipelineStageName(stageName);
  const extra = (substage ?? "").trim();
  return extra ? `${stage} · ${extra}` : stage;
}

export function PipelineAdvanceSuggestionsList({
  items,
  canRunJob,
}: {
  items: PipelineAdvanceSuggestionDTO[];
  canRunJob: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobNote, setJobNote] = useState<string | null>(null);
  const [peek, setPeek] = useState<PipelineConversationPeekTarget | null>(null);

  async function resolve(id: string, action: "accept" | "dismiss") {
    setPendingId(id);
    setError(null);
    const result = await resolvePipelineAdvanceSuggestion({ id, action });
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--vp-ink-muted)]">
          Só avançam etapa ou subetapa. Aceitar grava o status da conversa e move o funil.
        </p>
        {canRunJob ? (
          <button type="button" className={actionBtn} disabled={running} onClick={() => void runJob()}>
            {running ? "Analisando…" : "Atualizar agora"}
          </button>
        ) : null}
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
          {items.map((item) => {
            const busy = pendingId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--vp-wine)]">{item.personName}</p>
                    {item.companyLine ? (
                      <p className="text-sm text-[var(--vp-ink-muted)]">{item.companyLine}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--vp-ink-body)]">
                      {formatStageSubstage(item.fromStageName, item.fromSubstage)} →{" "}
                      <strong>{formatStageSubstage(item.toStageName, item.toSubstage)}</strong>
                    </p>
                    {item.rationale ? (
                      <p className="mt-2 text-sm text-[var(--vp-ink-body)]">{item.rationale}</p>
                    ) : null}
                    {item.evidenceQuote ? (
                      <blockquote className="mt-2 border-l-2 border-[var(--vp-gold)] pl-3 text-sm italic text-[var(--vp-ink-muted)]">
                        {item.evidenceQuote}
                      </blockquote>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
                    <button
                      type="button"
                      className={actionBtn}
                      disabled={busy}
                      onClick={() =>
                        setPeek(pipelineConversationPeekTarget(item.conversationId, item.personName))
                      }
                    >
                      Ver conversa
                    </button>
                    <button
                      type="button"
                      className={`${actionBtn} border-[rgba(199,166,77,0.55)] bg-[rgba(199,166,77,0.16)]`}
                      disabled={busy}
                      onClick={() => void resolve(item.id, "accept")}
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      className={actionBtn}
                      disabled={busy}
                      onClick={() => void resolve(item.id, "dismiss")}
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PipelineConversationPeek target={peek} onClose={() => setPeek(null)} />
    </div>
  );
}
