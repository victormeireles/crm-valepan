"use client";

import { useState } from "react";

type Insight = {
  status: "pending" | "processing" | "completed" | "failed" | "not_configured";
  extracted_text?: string | null;
  summary?: string | null;
  document_type?: string | null;
  language?: string | null;
  keywords?: string[];
  error_message?: string | null;
};

export function DocumentInsightPanel({ messageId }: { messageId: string }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestAnalysis(force = false) {
    setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      if (!force) {
        const currentResponse = await fetch(
          `/api/documents/messages/${encodeURIComponent(messageId)}/insight`,
          { cache: "no-store" },
        );
        const current = (await currentResponse.json()) as {
          insight?: Insight | null;
          error?: string;
        };
        if (!currentResponse.ok) throw new Error(current.error || "Falha ao consultar análise.");
        if (current.insight?.status === "completed" || current.insight?.status === "not_configured") {
          setInsight(current.insight);
          return;
        }
        if (current.insight?.status === "processing") {
          setInsight(current.insight);
          return;
        }
      }

      setInsight({ status: "processing" });
      const response = await fetch(
        `/api/documents/messages/${encodeURIComponent(messageId)}/insight`,
        { method: "POST" },
      );
      const result = (await response.json()) as { insight?: Insight; error?: string };
      if (!response.ok) throw new Error(result.error || "Falha ao analisar documento.");
      setInsight(result.insight ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao analisar documento.");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => void requestAnalysis()}
        className="mt-2 inline-flex rounded-lg border border-current/20 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-black/5"
      >
        ✦ Ler com IA
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-current/15 bg-black/5 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide">Leitura inteligente</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[11px] underline underline-offset-2"
        >
          Recolher
        </button>
      </div>

      {loading || insight?.status === "processing" ? (
        <p className="mt-2 text-xs opacity-80">Extraindo texto, aplicando OCR e resumindo…</p>
      ) : null}

      {insight?.status === "not_configured" ? (
        <p className="mt-2 text-xs opacity-80">
          Configure <code>OPENAI_API_KEY</code> no servidor para habilitar a análise.
        </p>
      ) : null}

      {error || insight?.status === "failed" ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-red-700">
            {error || insight?.error_message || "Não foi possível analisar este arquivo."}
          </p>
          <button
            type="button"
            onClick={() => void requestAnalysis(true)}
            className="text-xs font-semibold underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {insight?.status === "completed" ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {insight.document_type ? (
              <span className="rounded-full bg-black/10 px-2 py-1 text-[10px] font-semibold">
                {insight.document_type}
              </span>
            ) : null}
            {(insight.keywords ?? []).map((keyword) => (
              <span key={keyword} className="rounded-full border border-current/15 px-2 py-1 text-[10px]">
                {keyword}
              </span>
            ))}
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed">{insight.summary}</p>
          {insight.extracted_text ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold">Ver texto extraído</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 font-sans text-[11px] text-black">
                {insight.extracted_text}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
