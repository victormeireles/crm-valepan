"use client";

import { updateConversationContactName } from "@/app/actions/inbox";
import { getCustomerWaitSignal } from "@/lib/lead-signals";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

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
  stageName: string | null;
  weeklyVolumeKg: number | null;
  lastDirection: string | null;
  unread: boolean;
  callStatus: "ringing" | "missed_voice" | "missed_video" | null;
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
  return parts.map((p) => Array.from(p)[0]?.toUpperCase() ?? "").join("") || "?";
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
  page,
  renderNowMs,
  tabCounts,
}: {
  conversations: InboxSidebarRow[];
  selectedId: string | null;
  activeTab: "waiting" | "qualify" | "pipeline" | "groups" | "archived";
  page: number;
  renderNowMs: number;
  tabCounts: { waiting: number; qualify: number; pipeline: number };
}) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(renderNowMs);
  const [navigationPending, startNavigation] = useTransition();
  const [q, setQ] = useState("");
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(selectedId);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const conversationHref = (conversationId: string) => {
    const params = new URLSearchParams({ tab: activeTab, cid: conversationId });
    if (page > 1) params.set("page", String(page));
    return `/inbox?${params.toString()}`;
  };

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

  useEffect(() => {
    setOptimisticSelectedId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onRead = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail
        ?.conversationId;
      if (!conversationId) return;
      setReadIds((previous) => new Set(previous).add(conversationId));
    };
    window.addEventListener("crm:conversation-read", onRead);
    return () => window.removeEventListener("crm:conversation-read", onRead);
  }, []);

  return (
    <div
      aria-busy={navigationPending}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]"
    >
      <div className="shrink-0 border-b border-[var(--vp-ink-line)] p-3">
        <div className="mb-2.5 flex gap-0.5 rounded-full bg-[rgba(35,0,4,0.06)] p-[3px]">
          <Link
            href="/inbox?tab=waiting"
            className={`min-h-8 flex-1 rounded-full px-2 py-1.5 text-center text-xs font-bold ${
              activeTab === "waiting" ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]" : "text-[var(--vp-ink-muted)]"
            }`}
          >
            Esperando {tabCounts.waiting.toLocaleString("pt-BR")}
          </Link>
          <Link
            href="/inbox?tab=qualify"
            className={`min-h-8 flex-1 rounded-full px-2 py-1.5 text-center text-xs font-bold ${
              activeTab === "qualify"
                ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                : "text-[var(--vp-ink-muted)]"
            }`}
          >
            Qualificar {tabCounts.qualify.toLocaleString("pt-BR")}
          </Link>
          <Link
            href="/inbox?tab=pipeline"
            className={`min-h-8 flex-1 rounded-full px-2 py-1.5 text-center text-xs font-bold ${
              activeTab === "pipeline"
                ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                : "text-[var(--vp-ink-muted)]"
            }`}
          >
            Funil {tabCounts.pipeline.toLocaleString("pt-BR")}
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="inbox-search" className="flex min-h-10 flex-1 items-center gap-2 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
            <span className="material-symbols-outlined text-[17px] text-[var(--vp-ink-soft)]" aria-hidden="true">search</span>
            <span className="sr-only">Buscar conversas</span>
            <input
              id="inbox-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conversa"
              className="w-full border-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--vp-ink-soft)]"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <details className="group relative">
            <summary className={`grid size-10 cursor-pointer list-none place-items-center rounded-full text-[var(--vp-ink-muted)] marker:content-none hover:bg-[var(--vp-surface)] [&::-webkit-details-marker]:hidden ${activeTab === "groups" || activeTab === "archived" ? "bg-[var(--vp-surface)] text-[var(--vp-wine)]" : ""}`} aria-label="Outras filas">
              <span className="material-symbols-outlined text-xl" aria-hidden="true">more_horiz</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 min-w-40 overflow-hidden rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] py-1 shadow-[var(--sh-md)]">
              <Link href="/inbox?tab=archived" className="block min-h-10 px-3 py-2.5 text-xs text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)]">Arquivados</Link>
              <Link href="/inbox?tab=groups" className="block min-h-10 px-3 py-2.5 text-xs text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)]">Grupos</Link>
            </div>
          </details>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--vp-surface-high)] overflow-y-auto overscroll-contain">
        {filtered.map((c) => {
          const wait = getCustomerWaitSignal({ lastDirection: c.lastDirection, lastSentAt: c.lastAt, nowMs });
          return (
          <li
            key={c.id}
            className={`relative [contain-intrinsic-size:auto_88px] [content-visibility:auto] transition-colors hover:bg-[rgba(35,0,4,0.05)] ${
                c.id === optimisticSelectedId
                  ? "border-l-[3px] border-l-[var(--vp-wine)] bg-[rgba(35,0,4,0.09)]"
                  : "border-l-[3px] border-l-transparent"
              }`}
          >
            <Link
              href={conversationHref(c.id)}
              prefetch
              scroll={false}
              onMouseEnter={() => router.prefetch(conversationHref(c.id))}
              onFocus={() => router.prefetch(conversationHref(c.id))}
              onClick={(event) => {
                event.preventDefault();
                const href = conversationHref(c.id);
                setOptimisticSelectedId(c.id);
                startNavigation(() => router.push(href, { scroll: false }));
              }}
              className="block px-3.5 py-3 pr-10"
            >
              <div className="flex items-start gap-2.5">
                <div className="relative shrink-0">
                  {validAvatarUrl(c.avatarUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={validAvatarUrl(c.avatarUrl) as string}
                      alt={`Foto de ${c.identityName}`}
                      className="size-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="grid size-10 place-items-center rounded-full bg-[rgba(35,0,4,0.1)] text-[13px] font-extrabold text-[var(--vp-wine)]"
                      aria-label={`Avatar de ${c.identityName}`}
                      title={c.identityName}
                    >
                      {initials(c.identityName)}
                    </div>
                  )}
                  {c.unread && !readIds.has(c.id) ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[var(--vp-paper-pure)] bg-[var(--vp-wine)]" aria-label="Conversa com mensagens não lidas" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-[var(--vp-ink-body)]">{c.identityName}</span>
                    <span className={`ml-auto shrink-0 text-[11px] font-bold tabular-nums ${c.awaiting ? "text-[var(--vp-error)]" : "text-[var(--vp-ink-soft)]"}`} title={new Date(c.lastAt).toLocaleString("pt-BR")}>{wait.elapsed ?? "—"}</span>
                  </div>
                  <p className="truncate text-xs text-[var(--vp-ink-muted)]">{c.companyName ?? c.phone_e164}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  {c.callStatus === "ringing" ? (
                    <span
                      className="animate-pulse rounded-full bg-[var(--vp-whatsapp)] px-2 py-0.5 text-[9px] font-bold uppercase text-[var(--vp-paper-pure)]"
                      title="Cliente ligando agora"
                    >
                      Ligando
                    </span>
                  ) : null}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--vp-ink-muted)]">{c.preview}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-bold text-[var(--vp-ink-muted)]">
                <span className="rounded-full bg-[var(--vp-surface)] px-2 py-0.5">{c.stageName ?? c.leadLine}</span>
                <span className="rounded-full bg-[var(--vp-surface)] px-2 py-0.5">{c.weeklyVolumeKg == null ? "volume não informado" : `${c.weeklyVolumeKg.toLocaleString("pt-BR")} kg/sem`}</span>
                {c.callStatus && c.callStatus !== "ringing" ? (
                  <span className="font-semibold text-[var(--vp-wine)]">
                    <span className="material-symbols-outlined mr-1 align-middle text-sm" aria-hidden="true">
                      {c.callStatus === "missed_video" ? "videocam" : "call"}
                    </span>
                    {c.callStatus === "missed_video" ? "Videochamada perdida" : "Ligação perdida"}
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
                        router.push(conversationHref(c.id), { scroll: false });
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
        )})}
        {conversations.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhuma conversa ainda.</li>
        )}
        {conversations.length > 0 && filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhum resultado.</li>
        )}
      </ul>
      {navigationPending ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--vp-wine)] px-3 py-1 text-[10px] font-medium text-[var(--vp-gold)] shadow-[var(--sh-md)]">
          Abrindo conversa…
        </div>
      ) : null}
    </div>
  );
}
