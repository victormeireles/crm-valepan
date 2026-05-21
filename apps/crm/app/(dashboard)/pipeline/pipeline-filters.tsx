"use client";

import {
  isPipelineSignal,
  PIPELINE_SIGNAL_LABELS,
  PIPELINE_SIGNALS,
  PIPELINE_STALE_DAYS,
} from "@/lib/pipeline-signals";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const SEARCH_DEBOUNCE_MS = 300;

export function PipelineFilters({
  totalCount,
  visibleCount,
  teamOptions,
}: {
  totalCount: number;
  visibleCount: number;
  teamOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const mine = searchParams.get("mine") === "1";
  const owner = searchParams.get("owner")?.trim() ?? "";
  const signalRaw = searchParams.get("signal")?.trim() ?? "";
  const signal = isPipelineSignal(signalRaw) ? signalRaw : null;
  const q = searchParams.get("q") ?? "";

  const [draftQ, setDraftQ] = useState(q);

  useEffect(() => {
    setDraftQ(q);
  }, [q]);

  const pushParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (patch.owner !== undefined && patch.owner) next.delete("mine");
      if (patch.mine !== undefined && patch.mine === "1") next.delete("owner");
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/pipeline?${qs}` : "/pipeline");
      });
    },
    [router, searchParams],
  );

  const commitSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === q.trim()) return;
      pushParams({ q: trimmed || null });
    },
    [pushParams, q],
  );

  useEffect(() => {
    const trimmed = draftQ.trim();
    if (trimmed === q.trim()) return;
    const id = window.setTimeout(() => commitSearch(draftQ), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draftQ, q, commitSearch]);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--muted)]">Filtros do funil</p>
        <p className="text-xs tabular-nums text-[var(--muted)]">
          {visibleCount === totalCount ? (
            <>{totalCount} oportunidade{totalCount === 1 ? "" : "s"}</>
          ) : (
            <>
              {visibleCount} de {totalCount}
            </>
          )}
          {pending ? " · …" : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Buscar por nome ou telefone</span>
          <input
            type="search"
            value={draftQ}
            placeholder="Ex.: Maria, Valepan, 11999998888…"
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commitSearch(e.currentTarget.value);
            }}
          />
          <span className="text-[10px] text-[var(--muted)]">
            Também busca empresa e título da oportunidade. Atualiza ao digitar.
          </span>
        </label>

        <label className="flex min-w-[10rem] flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Responsável</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            value={mine ? "__mine__" : owner}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__mine__") pushParams({ mine: "1", owner: null });
              else if (v === "") pushParams({ mine: null, owner: null });
              else pushParams({ mine: null, owner: v });
            }}
          >
            <option value="">Todos</option>
            <option value="__mine__">Só os meus</option>
            {teamOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[10rem] flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Status automático</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            value={signal ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              pushParams({ signal: v || null });
            }}
          >
            <option value="">Todos</option>
            {PIPELINE_SIGNALS.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_SIGNAL_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(mine || owner || signal || q) ? (
        <button
          type="button"
          className="text-xs text-[var(--vp-wine)] hover:underline"
          onClick={() => router.push("/pipeline")}
        >
          Limpar filtros
        </button>
      ) : null}

      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Sinais: última mensagem do cliente (sem resposta) ou da equipe no WhatsApp/chat (respondido);
        oportunidade aberta sem movimento há {PIPELINE_STALE_DAYS}+ dias; próxima ação do funil
        vencida.
      </p>
    </div>
  );
}
