"use client";

import {
  refreshInboxSidebar,
  searchInboxConversationsByPhone,
  updateConversationContactName,
} from "@/app/actions/inbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContactAvatar } from "@/components/contact-avatar";
import { CategoryBadge } from "@/components/lead-identity";
import { CrmIcon } from "@/components/crm-icon";
import { PaginationNav } from "@/components/pagination-nav";
import { brazilPhoneSearchVariants } from "@crm/shared/phone";
import { isPhoneSearchQuery } from "@/lib/phone-search-query";
import { formatAbsoluteShort, formatElapsedShort, formatIntegerPt } from "@/lib/format-relative";
import { INBOX_SELECT_CONVERSATION_EVENT } from "./inbox-conversation-pane";
import {
  inboxClientHref,
  inboxShareHref,
  pushInboxClientUrl,
  readInboxLocation,
  replaceInboxClientUrl,
  type InboxTab,
} from "./inbox-location";
import { recordInboxBrowserMetric } from "@/lib/inbox-browser-performance";

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
  weeklyBreadCount: number | null;
  lastDirection: string | null;
  unread: boolean;
  callStatus: "ringing" | "missed_voice" | "missed_video" | null;
};

const PAGE_SIZE = 20;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function validAvatarUrl(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "null" || low === "undefined") return null;
  return t;
}

function ConversationElapsed({
  lastAt,
  awaiting,
  nowMs,
}: {
  lastAt: string;
  awaiting: boolean;
  nowMs: number;
}) {
  const [elapsed, setElapsed] = useState<string | null>(null);
  useEffect(() => {
    setElapsed(formatElapsedShort(lastAt, nowMs) ?? "—");
  }, [lastAt, nowMs]);
  return (
    <span
      className={`ml-auto shrink-0 text-[11px] font-bold tabular-nums ${
        awaiting ? "text-[var(--vp-error)]" : "text-[var(--vp-ink-soft)]"
      }`}
      title={elapsed ? formatAbsoluteShort(lastAt) : undefined}
    >
      {elapsed ?? "—"}
    </span>
  );
}

export function InboxSidebar({
  conversations,
  selectedId,
  activeTab,
  page,
  initialQuery,
  renderNowMs,
  tabCounts,
}: {
  conversations: InboxSidebarRow[];
  selectedId: string | null;
  activeTab: InboxTab;
  page: number;
  initialQuery: string;
  renderNowMs: number;
  tabCounts: { qualify: number; archived: number; groups: number; pipeline: number };
}) {
  const [nowMs, setNowMs] = useState(renderNowMs);
  const [searchPending, setSearchPending] = useState(false);
  const [phoneResults, setPhoneResults] = useState<InboxSidebarRow[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [liveTab, setLiveTab] = useState(activeTab);
  const [livePage, setLivePage] = useState(page);
  const [listPending, setListPending] = useState(false);
  const [liveConversations, setLiveConversations] = useState(conversations);
  const [liveTabCounts, setLiveTabCounts] = useState(tabCounts);
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(selectedId);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const requestVersion = useRef(0);
  const selectedIdRef = useRef(optimisticSelectedId);
  selectedIdRef.current = optimisticSelectedId;

  const conversationHref = (conversationId: string) =>
    inboxShareHref({
      tab: liveTab,
      page: livePage,
      cid: conversationId,
      lookup: phoneResults !== null && isPhoneSearchQuery(q),
    });

  const visibleConversations = phoneResults ?? liveConversations;
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return visibleConversations;
    const queryVariants = new Set(brazilPhoneSearchVariants(q));
    return visibleConversations.filter((c) => {
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
      if (hay.includes(needle)) return true;
      return brazilPhoneSearchVariants(c.phone_e164).some((variant) =>
        queryVariants.has(variant),
      );
    });
  }, [q, visibleConversations]);

  const applySidebarResult = useCallback((
    tab: InboxTab,
    nextPage: number,
    result: Awaited<ReturnType<typeof refreshInboxSidebar>>,
    startedAt: number,
  ) => {
    recordInboxBrowserMetric("sidebar_refresh", startedAt, {
      success: result.ok,
      rows: result.ok ? result.conversations.length : 0,
    });
    if (!result.ok) return;
    setLiveTab(tab);
    setLivePage(nextPage);
    setLiveConversations(result.conversations);
    setLiveTabCounts(result.tabCounts);
  }, []);

  const loadList = useCallback((
    tab: InboxTab,
    nextPage: number,
    mode: "push" | "replace" | "silent" = "push",
  ) => {
    const startedAt = performance.now();
    const version = ++requestVersion.current;
    setListPending(true);
    setLiveTab(tab);
    setLivePage(nextPage);
    if (mode !== "silent") {
      const href = inboxClientHref({ tab, page: nextPage, cid: selectedIdRef.current });
      const historyState = { inboxTab: tab, inboxPage: nextPage, inboxConversationId: selectedIdRef.current };
      if (mode === "push") pushInboxClientUrl(historyState, href);
      else replaceInboxClientUrl(historyState, href);
    }
    void refreshInboxSidebar({ tab, page: nextPage }).then((result) => {
      if (version !== requestVersion.current) return;
      applySidebarResult(tab, nextPage, result, startedAt);
      setListPending(false);
    }).catch(() => {
      if (version !== requestVersion.current) return;
      recordInboxBrowserMetric("sidebar_refresh", startedAt, { success: false, rows: 0 });
      setListPending(false);
    });
  }, [applySidebarResult]);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setLiveConversations(conversations);
    setLiveTabCounts(tabCounts);
  }, [conversations, tabCounts]);

  useEffect(() => {
    const refresh = () => loadList(liveTab, livePage, "silent");
    window.addEventListener("crm:inbox-sidebar-changed", refresh);
    return () => window.removeEventListener("crm:inbox-sidebar-changed", refresh);
  }, [liveTab, livePage, loadList]);

  useEffect(() => {
    const onPopState = () => {
      const next = readInboxLocation();
      loadList(next.tab, next.page, "silent");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadList]);

  useEffect(() => {
    const trimmed = q.trim();
    if (!isPhoneSearchQuery(trimmed)) {
      setPhoneResults(null);
      setSearchError(null);
      setSearchPending(false);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void searchInboxConversationsByPhone(trimmed).then((result) => {
        if (cancelled) return;
        setSearchPending(false);
        if (!result.ok) {
          setPhoneResults([]);
          setSearchError("Não foi possível buscar o telefone. Tente novamente.");
          return;
        }
        setPhoneResults(result.conversations.map((conversation) => ({
          id: conversation.id,
          kind: "lead" as const,
          displayName: conversation.identityName,
          phone_e164: conversation.phone,
          preview: "Telefone encontrado no CRM",
          lastAt: conversation.lastAt,
          leadLine: "Resultado da busca",
          awaiting: false,
          identityName: conversation.identityName,
          companyName: conversation.companyName,
          clientCategory: null,
          stageName: null,
          weeklyBreadCount: null,
          lastDirection: null,
          unread: false,
          callStatus: null,
        })));
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [q]);

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
      aria-busy={searchPending || listPending}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="shrink-0 border-b border-[var(--vp-ink-line)] p-3">
        <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-[18px] bg-[rgba(35,0,4,0.06)] p-[3px]">
          {([
            ["qualify", "Qualificar", liveTabCounts.qualify],
            ["archived", "Arquivados", liveTabCounts.archived],
            ["groups", "Grupos", liveTabCounts.groups],
            ["pipeline", "No funil", liveTabCounts.pipeline],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                if (tab === liveTab && livePage === 1) return;
                loadList(tab, 1);
              }}
              className={`min-h-8 rounded-[14px] px-2 py-1.5 text-center text-xs font-bold ${
                liveTab === tab
                  ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                  : "text-[var(--vp-ink-muted)] hover:bg-[rgba(35,0,4,0.04)]"
              }`}
            >
              {label} {formatIntegerPt(count)}
            </button>
          ))}
        </div>
        <label htmlFor="inbox-search" className="flex min-h-10 items-center gap-2 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
          <CrmIcon name="search" className="text-[17px] text-[var(--vp-ink-soft)]" />
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
        {isPhoneSearchQuery(q) ? (
          <p className="mt-1.5 px-2 text-[10px] text-[var(--vp-ink-muted)]">
            Buscando o telefone em todas as listas.
          </p>
        ) : null}
        {searchError ? (
          <p role="alert" className="mt-1.5 px-2 text-[10px] font-semibold text-[var(--vp-error)]">
            {searchError} A conversa atual foi preservada.
          </p>
        ) : null}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--vp-surface-high)] overflow-y-auto overscroll-contain">
        {listPending
          ? Array.from({ length: 8 }, (_, index) => (
              <li key={`inbox-skeleton-${index}`} className="px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--vp-surface-high)]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-2/3 animate-pulse rounded bg-[var(--vp-surface-high)]" />
                    <span className="block h-3 w-full animate-pulse rounded bg-[var(--vp-surface)]" />
                  </div>
                </div>
              </li>
            ))
          : filtered.map((c) => (
          <li
            key={c.id}
            className={`relative transition-colors hover:bg-[rgba(35,0,4,0.05)] ${
                c.id === optimisticSelectedId
                  ? "border-l-[3px] border-l-[var(--vp-wine)] bg-[rgba(35,0,4,0.09)]"
                  : "border-l-[3px] border-l-transparent"
              }`}
          >
            <a
              href={conversationHref(c.id)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                const href = inboxClientHref({ tab: liveTab, page: livePage, cid: c.id });
                setOptimisticSelectedId(c.id);
                window.dispatchEvent(new CustomEvent(INBOX_SELECT_CONVERSATION_EVENT, {
                  detail: { conversationId: c.id, href },
                }));
              }}
              className="block px-3.5 py-3 pr-10"
            >
              <div className="flex items-start gap-2.5">
                <div className="relative shrink-0">
                  <ContactAvatar
                    name={c.identityName}
                    src={validAvatarUrl(c.avatarUrl)}
                    phone={c.phone_e164}
                    className="size-10"
                    textClassName="text-[13px]"
                    allowRemoteFallback={false}
                    allowRefresh={false}
                  />
                  {c.unread && !readIds.has(c.id) ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[var(--vp-paper-pure)] bg-[var(--vp-wine)]" aria-label="Conversa com mensagens não lidas" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-[var(--vp-ink-body)]">{c.identityName}</span>
                    <CategoryBadge category={c.clientCategory} size="sm" />
                    <ConversationElapsed lastAt={c.lastAt} awaiting={c.awaiting} nowMs={nowMs} />
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
                <span className="rounded-full bg-[var(--vp-surface)] px-2 py-0.5">{c.weeklyBreadCount == null ? "volume não informado" : `${formatIntegerPt(c.weeklyBreadCount)} pães/sem`}</span>
                {c.callStatus && c.callStatus !== "ringing" ? (
                  <span className="font-semibold text-[var(--vp-wine)]">
                    <CrmIcon
                      name={c.callStatus === "missed_video" ? "videocam" : "call"}
                      className="mr-1 inline-block align-middle text-sm"
                    />
                    {c.callStatus === "missed_video" ? "Videochamada perdida" : "Ligação perdida"}
                  </span>
                ) : null}
              </div>
            </a>
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
                        setLiveConversations((rows) =>
                          rows.map((row) =>
                            row.id === c.id
                              ? { ...row, displayName: name, identityName: name }
                              : row,
                          ),
                        );
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
        {!listPending && phoneResults === null && liveConversations.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhuma conversa ainda.</li>
        )}
        {!listPending && ((phoneResults !== null && phoneResults.length === 0) ||
        (visibleConversations.length > 0 && filtered.length === 0)) ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nenhum resultado.</li>
        ) : null}
      </ul>
      <div className="shrink-0">
        <PaginationNav
          pathname="/inbox"
          page={livePage}
          pageSize={PAGE_SIZE}
          totalCount={liveTabCounts[liveTab]}
          searchParams={{ tab: liveTab, cid: optimisticSelectedId ?? undefined }}
          showBoundaryLinks
          onNavigate={(href) => {
            const nextPage = Number.parseInt(new URL(href, "http://local.invalid").searchParams.get("page") ?? "1", 10) || 1;
            loadList(liveTab, nextPage);
          }}
        />
      </div>
      {searchPending || listPending ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--vp-wine)] px-3 py-1 text-[10px] font-medium text-[var(--vp-gold)] shadow-[var(--sh-md)]">
          {searchPending ? "Buscando…" : "Atualizando lista…"}
        </div>
      ) : null}
    </div>
  );
}
