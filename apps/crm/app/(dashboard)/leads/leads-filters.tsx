"use client";

import { isClientCategoryValue } from "@/lib/client-categories";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const SEARCH_DEBOUNCE_MS = 300;

export function LeadsFilters({
  totalCount,
  visibleCount,
}: {
  totalCount: number;
  visibleCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const rawCat = searchParams.get("client_category")?.trim() ?? "";
  const clientCategory = isClientCategoryValue(rawCat) ? rawCat : null;

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
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/leads?${qs}` : "/leads");
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

  const hasFilters = q.trim().length > 0 || !!clientCategory;

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--muted)]">Busca na lista</p>
        <p className="text-xs tabular-nums text-[var(--muted)]">
          {visibleCount === totalCount ? (
            <>{totalCount} lead{totalCount === 1 ? "" : "s"}</>
          ) : (
            <>
              {visibleCount} de {totalCount}
            </>
          )}
          {pending ? " · …" : null}
        </p>
      </div>

      <label className="flex flex-col gap-1 text-xs">
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
          Também busca empresa, cidade, CNPJ e distribuidor. Atualiza ao digitar.
        </span>
      </label>

      {hasFilters ? (
        <button
          type="button"
          className="text-xs text-[var(--vp-wine)] hover:underline"
          onClick={() => router.push(clientCategory ? `/leads?client_category=${clientCategory}` : "/leads")}
        >
          Limpar busca{clientCategory ? " (mantém categoria)" : ""}
        </button>
      ) : null}
    </div>
  );
}
