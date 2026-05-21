"use client";

import { LeadIdentity } from "@/components/lead-identity";
import { updateConversationContactName } from "@/app/actions/inbox";
import { formatRelativeShort } from "@/lib/format-relative";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type InboxSidebarRow = {
  id: string;
  kind: "lead" | "group";
  /** Para prompt «Editar nome» e busca */
  displayName: string;
  phone_e164: string;
  avatarUrl?: string | null;
  preview: string;
  lastAt: string;
  leadLine: string;
  awaiting: boolean;
  identityName: string;
  companyName: string | null;
  clientCategory: string | null;
  unread: boolean;
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function validAvatarUrl(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "null" || low === "undefined") return null;
  return t;
}

export function InboxSidebar({
  conversations,
  selectedId,
  activeTab,
}: {
  conversations: InboxSidebarRow[];
  selectedId: string | null;
  activeTab: "leads" | "groups" | "archived";
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return conversations;
    return conversations.filter((c) => {
      const hay = norm(
        [
          c.displayName,
          c.identityName,
          c.companyName ?? "",
          c.phone_e164,
          c.preview,
          c.leadLine,
        ].join(" "),
      );
      return hay.includes(needle);
    });
  }, [conversations, q]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--vp-paper)] p-2">
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-md bg-[rgba(35,0,4,0.06)] p-1">
          <Link
            href="/inbox?tab=leads"
            className={`rounded px-2 py-1 text-center text-xs font-medium ${
              activeTab === "leads"
                ? "bg-[var(--vp-paper-pure)] text-[var(--foreground)] shadow-[var(--sh-sm)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Leads
          </Link>
          <Link
            href="/inbox?tab=archived"
            className={`rounded px-2 py-1 text-center text-xs font-medium ${
              activeTab === "archived"
                ? "bg-[var(--vp-paper-pure)] text-[var(--foreground)] shadow-[var(--sh-sm)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Arquivados
          </Link>
          <Link
            href="/inbox?tab=groups"
            className={`rounded px-2 py-1 text-center text-xs font-medium ${
              activeTab === "groups"
                ? "bg-[var(--vp-paper-pure)] text-[var(--foreground)] shadow-[var(--sh-sm)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Grupos
          </Link>
        </div>
        <label htmlFor="inbox-search" className="sr-only">
          Buscar conversas
        </label>
        <input
          id="inbox-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, telefone ou mensagem…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--vp-wine)] focus:ring-2 focus:ring-[var(--vp-gold)]/30"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto overscroll-contain">
        {filtered.map((c) => (
          <li
            key={c.id}
            className={`relative transition-colors hover:bg-[rgba(35,0,4,0.05)] ${
                c.id === selectedId
                  ? "border-l-[3px] border-l-[var(--vp-wine)] bg-[rgba(35,0,4,0.09)]"
                  : "border-l-[3px] border-l-transparent"
              }`}
          >
            <Link href={`/inbox?tab=${activeTab}&cid=${c.id}`} className="block px-4 py-3 pr-10">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {validAvatarUrl(c.avatarUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={validAvatarUrl(c.avatarUrl) as string}
                      alt={`Foto de ${c.identityName}`}
                      className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(35,0,4,0.14)] text-xs font-semibold text-[var(--vp-wine)]"
                      aria-label={`Avatar de ${c.identityName}`}
                      title={c.identityName}
                    >
                      {initials(c.identityName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <LeadIdentity
                      name={c.identityName}
                      companyName={c.companyName}
                      category={c.clientCategory}
                      phoneTitle={c.phone_e164}
                      size="sm"
                      layout="stacked"
                    />
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  {c.unread ? (
                    <span
                      className="size-2 shrink-0 rounded-full bg-[var(--vp-wine)]"
                      title="Mensagens não lidas"
                      aria-label="Conversa com mensagens não lidas"
                    />
                  ) : null}
                  <span
                    className="text-[10px] text-[var(--muted)]"
                    title={new Date(c.lastAt).toLocaleString("pt-BR")}
                  >
                    {formatRelativeShort(c.lastAt)}
                  </span>
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
            <div className="absolute right-2 top-2">
              <button
                type="button"
                aria-label="Mais ações da conversa"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuId((prev) => (prev === c.id ? null : c.id));
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-[var(--muted)] hover:bg-[rgba(35,0,4,0.08)] hover:text-[var(--foreground)]"
              >
                ▾
              </button>
              {openMenuId === c.id ? (
                <div className="absolute right-0 z-10 mt-1 min-w-[9rem] rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1 shadow-[var(--sh-md)]">
                  {c.kind === "lead" ? (
                    <button
                      type="button"
                      disabled={savingId === c.id}
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = window.prompt("Editar nome do contato", c.displayName);
                        if (next == null) {
                          setOpenMenuId(null);
                          return;
                        }
                        const name = next.trim();
                        if (!name) {
                          setErrorById((prev) => ({ ...prev, [c.id]: "Nome não pode ficar vazio." }));
                          return;
                        }
                        setSavingId(c.id);
                        setErrorById((prev) => ({ ...prev, [c.id]: null }));
                        const res = await updateConversationContactName({
                          conversationId: c.id,
                          contactName: name,
                        });
                        setSavingId(null);
                        if (!res.ok) {
                          setErrorById((prev) => ({ ...prev, [c.id]: res.error ?? "Erro ao salvar nome." }));
                          return;
                        }
                        setOpenMenuId(null);
                        router.push(`/inbox?tab=${activeTab}&cid=${c.id}`);
                        router.refresh();
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--foreground)] hover:bg-[rgba(35,0,4,0.07)] disabled:opacity-50"
                    >
                      {savingId === c.id ? "Salvando..." : "Editar nome"}
                    </button>
                  ) : (
                    <span className="block px-2 py-1.5 text-xs text-[var(--muted)]">
                      Sem ações disponíveis
                    </span>
                  )}
                </div>
              ) : null}
            </div>
            {errorById[c.id] ? (
              <p className="px-4 pb-2 text-[11px] text-[var(--vp-error)]">{errorById[c.id]}</p>
            ) : null}
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
