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
  mineCount,
  canViewTeam,
}: {
  totalCount: number;
  visibleCount: number;
  teamOptions: { id: string; label: string; count: number }[];
  mineCount: number;
  canViewTeam: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const mine = searchParams.get("mine") === "1";
  const owner = searchParams.get("owner")?.trim() ?? "";
  const signalRaw = searchParams.get("signal")?.trim() ?? "";
  const signal = isPipelineSignal(signalRaw) ? signalRaw : null;
  const region = searchParams.get("region")?.trim() ?? "";
  const clientCategory = searchParams.get("client_category")?.trim() ?? "";
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
      next.delete("page");
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

  const ownerButtonClass = (selected: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
      selected
        ? "border-[var(--vp-gold)] bg-[var(--vp-wine)] font-semibold text-[var(--vp-gold)] shadow-sm"
        : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--vp-gold)]"
    }`;

  return (
    <div className="space-y-4">
      {canViewTeam ? <section
        aria-label="Funil por vendedor"
        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Funil por vendedor</h2>
            <p className="text-xs text-[var(--muted)]">
              Selecione um responsável para ver a carteira dele.
            </p>
          </div>
          {pending ? <span className="text-xs text-[var(--muted)]">Atualizando…</span> : null}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Selecionar vendedor">
          <button
            type="button"
            className={ownerButtonClass(!mine && !owner)}
            aria-pressed={!mine && !owner}
            onClick={() => pushParams({ mine: null, owner: null })}
          >
            <span>Todos</span>
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs tabular-nums">
              {totalCount}
            </span>
          </button>
          <button
            type="button"
            className={ownerButtonClass(mine)}
            aria-pressed={mine}
            onClick={() => pushParams({ mine: "1", owner: null })}
          >
            <span>Meus</span>
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs tabular-nums">
              {mineCount}
            </span>
          </button>
          {teamOptions.map((option) => {
            const selected = !mine && owner === option.id;
            const initials = option.label
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("");
            return (
              <button
                key={option.id}
                type="button"
                className={ownerButtonClass(selected)}
                aria-pressed={selected}
                onClick={() => pushParams({ mine: null, owner: option.id })}
              >
                <span
                  aria-hidden="true"
                  className="grid size-6 place-items-center rounded-full bg-[var(--vp-gold)] text-[10px] font-bold text-[var(--vp-wine)]"
                >
                  {initials || "?"}
                </span>
                <span>{option.label}</span>
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs tabular-nums">
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
      </section> : (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Novos leads e minha carteira</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Você vê a fila de novos contatos e os leads atribuídos ao seu usuário.
          </p>
        </section>
      )}

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
          <span className="text-[var(--muted)]">Região</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            value={region}
            onChange={(e) => pushParams({ region: e.target.value || null })}
          >
            <option value="">Todas</option>
            <option value="sp">São Paulo (DDD 11)</option>
            <option value="rj">Rio de Janeiro (DDD 21)</option>
          </select>
        </label>

        <label className="flex min-w-[10rem] flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Tipo de cliente</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            value={clientCategory}
            onChange={(e) => pushParams({ client_category: e.target.value || null })}
          >
            <option value="">Todos</option>
            <option value="hamburgueria">Hamburgueria</option>
            <option value="distribuidor">Distribuidor</option>
            <option value="parceiros">Parceiros</option>
            <option value="outros">Outros</option>
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

      {(mine || owner || signal || region || clientCategory || q) ? (
        <button
          type="button"
          className="text-xs text-[var(--vp-wine)] hover:underline"
          onClick={() => router.push("/pipeline")}
        >
          Limpar filtros
        </button>
      ) : null}

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Sinais: última mensagem do cliente (sem resposta) ou da equipe no WhatsApp/chat
          (respondido); oportunidade aberta sem movimento há {PIPELINE_STALE_DAYS}+ dias; próxima
          ação do funil vencida.
        </p>
      </div>
    </div>
  );
}
