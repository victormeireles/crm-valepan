"use client";

import { isClientCategoryValue, type ClientCategoryValue } from "@/lib/client-categories";
import { IFOOD_CAMPAIGN } from "@/lib/lead-capture";

const CLIENT_CATEGORY_LABELS: Record<ClientCategoryValue, string> = {
  hamburgueria: "Hamburguerias",
  distribuidor: "Distribuidores",
  parceiros: "Parceiros",
  outros: "Outros",
};
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
  const campaign = searchParams.get("campaign") === IFOOD_CAMPAIGN.source ? IFOOD_CAMPAIGN.source : "";
  const filtering = q.trim().length > 0;

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
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/leads?${qs}` : "/leads");
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const trimmed = draftQ.trim();
    if (trimmed === q.trim()) return;
    const id = window.setTimeout(
      () => pushParams({ q: trimmed || null }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [draftQ, q, pushParams]);

  const clearParams = new URLSearchParams();
  if (clientCategory) clearParams.set("client_category", clientCategory);
  if (campaign) clearParams.set("campaign", campaign);
  const clearHref = clearParams.size ? `/leads?${clearParams}` : "/leads";

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--vp-paper)] px-3 py-2.5 sm:flex-row sm:items-center">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-[var(--muted)]">Buscar</span>
        <input
          type="search"
          value={draftQ}
          placeholder="Nome, telefone, empresa, CNPJ…"
          title="Busca por contato, telefone, empresa, cidade, CNPJ e distribuidor"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2.5 py-1.5 text-sm"
          onChange={(e) => setDraftQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const trimmed = e.currentTarget.value.trim();
            if (trimmed !== q.trim()) pushParams({ q: trimmed || null });
          }}
        />
      </label>

      <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
        Campanha
        <select value={campaign} onChange={(event) => pushParams({ campaign: event.target.value || null })}
          className="rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2.5 py-1.5 text-sm text-[var(--foreground)]">
          <option value="">Todas</option>
          <option value={IFOOD_CAMPAIGN.source}>{IFOOD_CAMPAIGN.label}</option>
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {clientCategory ? (
          <span className="rounded-full bg-[rgba(35,0,4,0.06)] px-2 py-0.5 text-[var(--foreground)]">
            {CLIENT_CATEGORY_LABELS[clientCategory] ?? clientCategory}
          </span>
        ) : null}
        {filtering ? (
          <>
            <span className="tabular-nums text-[var(--muted)]">
              {visibleCount} de {totalCount}
              {pending ? " · …" : ""}
            </span>
            <button
              type="button"
              className="font-medium text-[var(--vp-wine)] hover:underline"
              onClick={() => router.push(clearHref)}
            >
              Limpar
            </button>
          </>
        ) : (
          <span className="tabular-nums text-[var(--muted)]">
            {totalCount} lead{totalCount === 1 ? "" : "s"}
            {pending ? " · …" : ""}
          </span>
        )}
        {clientCategory && !filtering ? (
          <button
            type="button"
            className="text-[var(--vp-wine)] hover:underline"
            onClick={() => router.push("/leads")}
          >
            Ver todos
          </button>
        ) : null}
      </div>
    </div>
  );
}
