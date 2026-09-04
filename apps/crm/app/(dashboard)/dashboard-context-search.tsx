"use client";

import { CrmIcon } from "@/components/crm-icon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

export function DashboardContextSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(query);

  useEffect(() => setDraft(query), [query]);

  const commit = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    const queryString = next.toString();
    router.push(queryString ? `/pipeline?${queryString}` : "/pipeline");
  }, [router, searchParams]);

  useEffect(() => {
    if (pathname !== "/pipeline" || draft.trim() === query.trim()) return;
    const id = window.setTimeout(() => commit(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [commit, draft, pathname, query]);

  if (pathname !== "/pipeline") return null;

  return (
    <label className="flex min-h-10 min-w-[17.5rem] items-center gap-2 rounded-full border border-[rgba(255,215,115,0.35)] bg-[rgba(255,248,247,0.08)] px-3.5">
      <CrmIcon name="search" className="text-lg text-[var(--vp-gold)]" />
      <span className="sr-only">Buscar no funil</span>
      <input
        type="search"
        value={draft}
        placeholder="Buscar lead, empresa ou telefone"
        className="w-full border-0 bg-transparent text-[13px] text-[var(--vp-paper)] outline-none placeholder:text-[rgba(255,248,247,0.62)]"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit(event.currentTarget.value);
        }}
      />
    </label>
  );
}
