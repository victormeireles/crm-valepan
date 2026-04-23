"use client";

import { formatRelativeShort } from "@/lib/format-relative";
import Link from "next/link";
import { useMemo, useState } from "react";

export type InboxSidebarRow = {
  id: string;
  displayName: string;
  phone_e164: string;
  preview: string;
  lastAt: string;
  leadLine: string;
  awaiting: boolean;
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function InboxSidebar({
  conversations,
  selectedId,
}: {
  conversations: InboxSidebarRow[];
  selectedId: string | null;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return conversations;
    return conversations.filter((c) => {
      const hay = norm(
        [c.displayName, c.phone_e164, c.preview, c.leadLine].join(" "),
      );
      return hay.includes(needle);
    });
  }, [conversations, q]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
      <div className="shrink-0 border-b border-[var(--border)] p-2">
        <label htmlFor="inbox-search" className="sr-only">
          Buscar conversas
        </label>
        <input
          id="inbox-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, telefone ou mensagem…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--vp-wine)] focus:ring-2 focus:ring-[var(--vp-gold)]/30"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto overscroll-contain">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link
              href={`/inbox?cid=${c.id}`}
              className={`flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--vp-surface-low)] ${
                c.id === selectedId
                  ? "border-l-[3px] border-l-[var(--vp-wine)] bg-[var(--vp-surface-low)]"
                  : "border-l-[3px] border-l-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[var(--foreground)]">{c.displayName}</span>
                <span
                  className="shrink-0 text-[10px] text-[var(--muted)]"
                  title={new Date(c.lastAt).toLocaleString("pt-BR")}
                >
                  {formatRelativeShort(c.lastAt)}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-[var(--muted)]">{c.preview}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--muted)]">
                <span>{c.leadLine}</span>
                {c.awaiting ? (
                  <span
                    className="inline-flex items-center gap-1 font-medium text-[var(--vp-wine)]"
                    title="Última mensagem do cliente — aguarda resposta"
                  >
                    <span className="size-1.5 rounded-full bg-[var(--vp-wine)]" aria-hidden />
                    Aguarda resposta
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
        {conversations.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhuma conversa ainda.</li>
        )}
        {conversations.length > 0 && filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhum resultado.</li>
        )}
      </ul>
    </div>
  );
}
