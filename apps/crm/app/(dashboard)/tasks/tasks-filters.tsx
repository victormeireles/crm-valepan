"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const SEARCH_DEBOUNCE_MS = 300;

export function TasksFilters({
  totalCount,
  visibleCount,
  openVisible,
  openTotal,
  doneVisible,
  doneTotal,
}: {
  totalCount: number;
  visibleCount: number;
  openVisible: number;
  openTotal: number;
  doneVisible: number;
  doneTotal: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const [draftQ, setDraftQ] = useState(q);
  const filtering = q.trim().length > 0;

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
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/tasks?${qs}` : "/tasks");
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
    <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--vp-paper)] px-3 py-2.5 sm:flex-row sm:items-center">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-[var(--muted)]">Buscar</span>
        <input
          type="search"
          value={draftQ}
          placeholder="Nome, telefone ou título da tarefa…"
          title="Filtra em aberto e concluídas por contato, empresa ou telefone do lead"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2.5 py-1.5 text-sm"
          onChange={(e) => setDraftQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commitSearch(e.currentTarget.value);
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[rgba(35,0,4,0.06)] px-2 py-0.5 tabular-nums text-[var(--foreground)]">
          Abertas {openVisible}
          {filtering && openVisible !== openTotal ? `/${openTotal}` : ""}
        </span>
        <span className="rounded-full bg-[rgba(35,0,4,0.04)] px-2 py-0.5 tabular-nums text-[var(--muted)]">
          Concluídas {doneVisible}
          {filtering && doneVisible !== doneTotal ? `/${doneTotal}` : ""}
        </span>
        {filtering ? (
          <>
            <span className="tabular-nums text-[var(--muted)]">
              {visibleCount} de {totalCount}
              {pending ? " · …" : ""}
            </span>
            <button
              type="button"
              className="font-medium text-[var(--vp-wine)] hover:underline"
              onClick={() => router.push("/tasks")}
            >
              Limpar
            </button>
          </>
        ) : (
          <span className="tabular-nums text-[var(--muted)]">
            {totalCount} tarefa{totalCount === 1 ? "" : "s"}
            {pending ? " · …" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
