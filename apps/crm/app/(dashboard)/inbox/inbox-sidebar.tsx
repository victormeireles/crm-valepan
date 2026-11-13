"use client";

import {
  markConversationUnread,
  refreshInboxSidebar,
  updateConversationContactName,
} from "@/app/actions/inbox";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactAvatar } from "@/components/contact-avatar";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";
import { PaginationNav } from "@/components/pagination-nav";
import { isInboxSearchQuery, isPhoneSearchQuery } from "@/lib/phone-search-query";
import { formatAbsoluteShort, formatElapsedShort } from "@/lib/format-relative";
import { INBOX_SELECT_CONVERSATION_EVENT } from "./inbox-conversation-pane";
import {
  formatUnreadBadge,
  inboxClientHref,
  inboxShareHref,
  isInboxTab,
  pushInboxClientUrl,
  readInboxLocation,
  removeReadConversation,
  replaceInboxClientUrl,
  resolveInboxTabTotal,
  sumInboxTabCounts,
  type InboxSearchScope,
  type InboxTab,
  type InboxTabCounts,
  type InboxUnreadCounts,
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

const INBOX_RAIL: { tab: InboxTab; label: string; icon: CrmIconName }[] = [
  { tab: "leads", label: "Leads", icon: "chat" },
  { tab: "groups", label: "Grupos", icon: "groups" },
  { tab: "clientes", label: "Clientes", icon: "archive" },
  { tab: "perdidos", label: "Perdidos", icon: "flag" },
];

function unreadCountForScope(counts: InboxUnreadCounts, scope: InboxSearchScope): number {
  if (scope === "all") return counts.leads + counts.groups + counts.clientes + counts.perdidos;
  return counts[scope];
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
  unreadCounts,
  unreadOnly,
  tabTotal,
}: {
  conversations: InboxSidebarRow[];
  selectedId: string | null;
  activeTab: InboxSearchScope;
  page: number;
  initialQuery: string;
  renderNowMs: number;
  tabCounts: InboxTabCounts;
  unreadCounts: InboxUnreadCounts;
  unreadOnly: boolean;
  tabTotal?: number;
}) {
  const initialSearch = isInboxSearchQuery(initialQuery);
  const [nowMs, setNowMs] = useState(renderNowMs);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [liveTab, setLiveTab] = useState<InboxSearchScope>(activeTab);
  const [livePage, setLivePage] = useState(page);
  const [listPending, setListPending] = useState(false);
  const [liveConversations, setLiveConversations] = useState(conversations);
  const [liveUnreadCounts, setLiveUnreadCounts] = useState(unreadCounts);
  const [liveUnreadOnly, setLiveUnreadOnly] = useState(unreadOnly);
  const [liveTabTotal, setLiveTabTotal] = useState(
    tabTotal ?? (activeTab === "all" ? sumInboxTabCounts(tabCounts) : tabCounts[activeTab]),
  );
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(selectedId);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const requestVersion = useRef(0);
  const selectedIdRef = useRef(optimisticSelectedId);
  selectedIdRef.current = optimisticSelectedId;
  const qRef = useRef(q);
  qRef.current = q;
  const liveTabRef = useRef(liveTab);
  liveTabRef.current = liveTab;
  const livePageRef = useRef(livePage);
  livePageRef.current = livePage;
  const liveUnreadOnlyRef = useRef(liveUnreadOnly);
  liveUnreadOnlyRef.current = liveUnreadOnly;
  const liveConversationsRef = useRef(liveConversations);
  liveConversationsRef.current = liveConversations;
  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;
  const tabBeforeSearchRef = useRef<InboxTab>(isInboxTab(activeTab) ? activeTab : "leads");
  const searchModeRef = useRef(initialSearch);
  const skipSearchBootstrapRef = useRef(initialSearch);

  const searchActive = isInboxSearchQuery(q);
  const paginationTotal = liveTabTotal;

  const scopeUnreadCount = unreadCountForScope(liveUnreadCounts, liveTab);
  const scopeUnreadBadge = formatUnreadBadge(scopeUnreadCount);

  const conversationHref = (conversationId: string) =>
    inboxShareHref({
      tab: liveTab,
      page: livePage,
      cid: conversationId,
      lookup: searchActive && isPhoneSearchQuery(q),
      q: searchActive ? q.trim() : null,
      unread: liveUnreadOnly,
    });

  const applySidebarResult = useCallback((
    tab: InboxSearchScope,
    nextPage: number,
    result: Awaited<ReturnType<typeof refreshInboxSidebar>>,
    startedAt: number,
    unreadActive: boolean,
  ) => {
    recordInboxBrowserMetric("sidebar_refresh", startedAt, {
      success: result.ok,
      rows: result.ok ? result.conversations.length : 0,
    });
    if (!result.ok) return;
    setLiveTab(tab);
    setLivePage(nextPage);
    setLiveConversations(result.conversations);
    setLiveUnreadCounts(result.unreadCounts);
    setLiveTabTotal(resolveInboxTabTotal({
      unreadActive,
      tab,
      tabTotal: result.tabTotal,
      tabCounts: result.tabCounts,
    }));
  }, []);

  const loadList = useCallback((
    tab: InboxSearchScope,
    nextPage: number,
    mode: "push" | "replace" | "silent" = "push",
    query?: string | null,
    unread?: boolean,
  ) => {
    const startedAt = performance.now();
    const version = ++requestVersion.current;
    const activeQuery = query === undefined
      ? (isInboxSearchQuery(qRef.current) ? qRef.current.trim() : null)
      : query?.trim() || null;
    const unreadFilter = unread === undefined ? liveUnreadOnlyRef.current : unread;
    setListPending(true);
    setLiveTab(tab);
    setLivePage(nextPage);
    setLiveUnreadOnly(unreadFilter);
    if (mode !== "silent") {
      const href = inboxClientHref({ tab, page: nextPage, cid: selectedIdRef.current, unread: unreadFilter });
      const historyState = {
        inboxTab: tab,
        inboxPage: nextPage,
        inboxConversationId: selectedIdRef.current,
        inboxUnread: unreadFilter,
      };
      if (mode === "push") pushInboxClientUrl(historyState, href);
      else replaceInboxClientUrl(historyState, href);
    }
    void refreshInboxSidebar({ tab, page: nextPage, query: activeQuery, unread: unreadFilter }).then((result) => {
      if (version !== requestVersion.current) return;
      applySidebarResult(tab, nextPage, result, startedAt, unreadFilter);
      setListPending(false);
      setSearchPending(false);
      if (!result.ok) {
        setSearchError("Não foi possível atualizar a lista. Tente novamente.");
        return;
      }
      setSearchError(null);
    }).catch(() => {
      if (version !== requestVersion.current) return;
      recordInboxBrowserMetric("sidebar_refresh", startedAt, { success: false, rows: 0 });
      setListPending(false);
      setSearchPending(false);
      setSearchError("Não foi possível atualizar a lista. Tente novamente.");
    });
  }, [applySidebarResult]);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setLiveConversations(conversations);
    setLiveUnreadCounts(unreadCounts);
    setLiveUnreadOnly(unreadOnly);
    setLiveTabTotal(
      tabTotal ?? (activeTab === "all" ? sumInboxTabCounts(tabCounts) : isInboxTab(activeTab) ? tabCounts[activeTab] : sumInboxTabCounts(tabCounts)),
    );
    setLiveTab(activeTab);
    setLivePage(page);
  }, [conversations, tabCounts, unreadCounts, unreadOnly, tabTotal, activeTab, page]);

  useEffect(() => {
    const refresh = () => loadList(liveTab, livePage, "silent");
    window.addEventListener("crm:inbox-sidebar-changed", refresh);
    return () => window.removeEventListener("crm:inbox-sidebar-changed", refresh);
  }, [liveTab, livePage, loadList]);

  useEffect(() => {
    const onPopState = () => {
      const next = readInboxLocation();
      loadList(next.tab, next.page, "silent", undefined, next.unread);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadList]);

  useEffect(() => {
    const trimmed = q.trim();
    const searching = isInboxSearchQuery(trimmed);
    let cancelled = false;

    if (!searching) {
      setSearchPending(false);
      if (!searchModeRef.current) return;
      searchModeRef.current = false;
      skipSearchBootstrapRef.current = false;
      const restoreTab = tabBeforeSearchRef.current;
      setLiveTab(restoreTab);
      const timeout = window.setTimeout(() => {
        if (cancelled) return;
        loadList(restoreTab, 1, "replace", null);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    if (skipSearchBootstrapRef.current) {
      skipSearchBootstrapRef.current = false;
      searchModeRef.current = true;
      return;
    }

    const enteringSearch = !searchModeRef.current;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      if (enteringSearch) {
        if (isInboxTab(liveTabRef.current)) {
          tabBeforeSearchRef.current = liveTabRef.current;
        }
        searchModeRef.current = true;
      }
      setSearchPending(true);
      setSearchError(null);
      const nextTab: InboxSearchScope = enteringSearch ? "all" : liveTabRef.current;
      loadList(nextTab, 1, "replace", trimmed);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [q, loadList]);

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
      const row = liveConversationsRef.current.find((r) => r.id === conversationId);
      const wasUnread = Boolean(row?.unread) && !readIdsRef.current.has(conversationId);
      setReadIds((previous) => new Set(previous).add(conversationId));
      const tab = liveTabRef.current;
      if (wasUnread && isInboxTab(tab)) {
        setLiveUnreadCounts((counts) => ({ ...counts, [tab]: Math.max(0, counts[tab] - 1) }));
      }
      if (wasUnread && liveUnreadOnlyRef.current) {
        setLiveConversations((rows) => removeReadConversation(rows, conversationId, true));
        setLiveTabTotal((total) => Math.max(0, total - 1));
      }
    };
    window.addEventListener("crm:conversation-read", onRead);
    return () => window.removeEventListener("crm:conversation-read", onRead);
  }, []);

  const markUnread = useCallback(async (c: InboxSidebarRow) => {
    const wasUnread = c.unread && !readIdsRef.current.has(c.id);
    const tab = liveTabRef.current;
    setSavingId(c.id);
    setErrorById((prev) => ({ ...prev, [c.id]: null }));
    const res = await markConversationUnread(c.id);
    setSavingId(null);
    if (!res.ok) {
      setErrorById((prev) => ({ ...prev, [c.id]: res.error ?? "Erro ao marcar como não lida." }));
      return;
    }
    window.dispatchEvent(new CustomEvent("crm:conversation-unread", { detail: { conversationId: c.id } }));
    setReadIds((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
    setLiveConversations((rows) => rows.map((r) => (r.id === c.id ? { ...r, unread: true } : r)));
    setOpenMenuId(null);
    if (wasUnread) return;
    if (isInboxTab(tab)) {
      setLiveUnreadCounts((counts) => ({ ...counts, [tab]: counts[tab] + 1 }));
    } else {
      loadList(tab, livePageRef.current, "silent");
    }
  }, [loadList]);

  const setUnreadFilter = (next: boolean) => {
    if (next === liveUnreadOnly) return;
    loadList(liveTab, 1, "push", undefined, next);
  };

  const selectRailTab = (tab: InboxTab) => {
    // Em modo busca, clicar na lista já ativa volta ao escopo "Todas".
    const nextTab: InboxSearchScope = searchActive && liveTab === tab ? "all" : tab;
    if (nextTab === liveTab && livePage === 1 && !liveUnreadOnly) return;
    loadList(nextTab, 1, "push", undefined, false);
  };

  return (
    <div
      aria-busy={searchPending || listPending}
      className="relative flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <nav
        aria-label="Listas do inbox"
        className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--vp-ink-line)] bg-[var(--vp-paper)] py-2"
      >
        {INBOX_RAIL.map(({ tab, label, icon }) => {
          const active = liveTab === tab;
          const badge = formatUnreadBadge(liveUnreadCounts[tab]);
          return (
            <button
              key={tab}
              type="button"
              title={label}
              aria-label={badge ? `${label}, ${badge} não lidas` : label}
              aria-current={active ? "page" : undefined}
              onClick={() => selectRailTab(tab)}
              className={`relative flex size-10 items-center justify-center rounded-xl text-[22px] transition-colors ${
                active
                  ? "bg-[rgba(35,0,4,0.09)] text-[var(--vp-wine)]"
                  : "text-[var(--vp-ink-soft)] hover:bg-[rgba(35,0,4,0.05)] hover:text-[var(--vp-ink-body)]"
              }`}
            >
              <CrmIcon name={icon} />
              {badge ? (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--vp-wine)] px-1 text-[10px] font-bold leading-none tabular-nums text-[var(--vp-paper-pure)]">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-[var(--vp-ink-line)] p-3">
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
          <div role="tablist" aria-label="Filtro de leitura" className="mt-2 flex gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={!liveUnreadOnly}
              onClick={() => setUnreadFilter(false)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                !liveUnreadOnly
                  ? "bg-[var(--vp-wine)] text-[var(--vp-paper-pure)]"
                  : "bg-[var(--vp-surface)] text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface-high)]"
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={liveUnreadOnly}
              onClick={() => setUnreadFilter(true)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                liveUnreadOnly
                  ? "bg-[var(--vp-wine)] text-[var(--vp-paper-pure)]"
                  : "bg-[var(--vp-surface)] text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface-high)]"
              }`}
            >
              Não lidas{scopeUnreadBadge ? ` ${scopeUnreadBadge}` : ""}
            </button>
          </div>
          {searchActive ? (
            <p className="mt-1.5 px-1 text-[10px] text-[var(--vp-ink-muted)]">
              {liveTab === "all"
                ? "Buscando em todas as listas."
                : "Resultados filtrados pela lista selecionada."}
            </p>
          ) : null}
          {searchError ? (
            <p role="alert" className="mt-1.5 px-1 text-[10px] font-semibold text-[var(--vp-error)]">
              {searchError} A conversa atual foi preservada.
            </p>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-[var(--vp-surface-high)] overflow-y-auto overscroll-contain">
          {listPending
            ? Array.from({ length: 10 }, (_, index) => (
                <li key={`inbox-skeleton-${index}`} className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--vp-surface-high)]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <span className="block h-3 w-2/3 animate-pulse rounded bg-[var(--vp-surface-high)]" />
                      <span className="block h-3 w-full animate-pulse rounded bg-[var(--vp-surface)]" />
                    </div>
                  </div>
                </li>
              ))
            : liveConversations.map((c) => {
                const showUnread = c.unread && !readIds.has(c.id);
                return (
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
                        const href = inboxClientHref({ tab: liveTab, page: livePage, cid: c.id, unread: liveUnreadOnly });
                        setOptimisticSelectedId(c.id);
                        window.dispatchEvent(new CustomEvent(INBOX_SELECT_CONVERSATION_EVENT, {
                          detail: {
                            conversationId: c.id,
                            href,
                            preview: {
                              name: c.identityName,
                              phone: c.phone_e164,
                              company: c.companyName,
                              avatarUrl: c.avatarUrl ?? null,
                            },
                          },
                        }));
                      }}
                      className="block px-3 py-2 pr-9"
                    >
                      <div className="flex items-center gap-2.5">
                        <ContactAvatar
                          name={c.identityName}
                          src={validAvatarUrl(c.avatarUrl)}
                          phone={c.phone_e164}
                          className="size-10 shrink-0"
                          textClassName="text-[13px]"
                          allowRemoteFallback={false}
                          allowRefresh={false}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className={`truncate text-sm text-[var(--vp-ink-body)] ${showUnread ? "font-extrabold" : "font-bold"}`}>
                              {c.identityName}
                            </span>
                            <ConversationElapsed lastAt={c.lastAt} awaiting={c.awaiting} nowMs={nowMs} />
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-xs text-[var(--vp-ink-muted)]">
                              {c.callStatus === "ringing" ? (
                                <span
                                  className="mr-1 animate-pulse font-bold text-[var(--vp-wine)]"
                                  title="Cliente ligando agora"
                                >
                                  <CrmIcon name="call" className="mr-0.5 inline-block align-middle text-sm" />
                                  Ligando
                                </span>
                              ) : c.callStatus ? (
                                <span
                                  className="mr-1 font-semibold text-[var(--vp-wine)]"
                                  title={c.callStatus === "missed_video" ? "Videochamada perdida" : "Ligação perdida"}
                                >
                                  <CrmIcon
                                    name={c.callStatus === "missed_video" ? "videocam" : "call"}
                                    className="mr-0.5 inline-block align-middle text-sm"
                                  />
                                  Perdida
                                </span>
                              ) : null}
                              {c.preview}
                            </p>
                            {showUnread ? (
                              <span
                                className="size-2.5 shrink-0 rounded-full bg-[var(--vp-wine)]"
                                role="img"
                                aria-label="Não lida"
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </a>
                    <div className="absolute right-1.5 top-1.5">
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
                        <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1 shadow-[var(--sh-md)]">
                          <button
                            type="button"
                            disabled={savingId === c.id || showUnread}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void markUnread(c);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--foreground)] hover:bg-[rgba(35,0,4,0.07)] disabled:opacity-50"
                          >
                            {showUnread ? "Já não lida" : "Marcar como não lida"}
                          </button>
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
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {errorById[c.id] ? (
                      <p className="px-4 pb-2 text-[11px] text-[var(--vp-error)]">{errorById[c.id]}</p>
                    ) : null}
                  </li>
                );
              })}
          {!listPending && liveConversations.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              {searchActive
                ? "Nenhum resultado."
                : liveUnreadOnly
                  ? "Nenhuma conversa não lida."
                  : "Nenhuma conversa ainda."}
            </li>
          ) : null}
        </ul>
        <div className="shrink-0">
          <PaginationNav
            pathname="/inbox"
            page={livePage}
            pageSize={PAGE_SIZE}
            totalCount={paginationTotal}
            searchParams={{
              tab: liveTab,
              cid: optimisticSelectedId ?? undefined,
              ...(liveUnreadOnly ? { unread: "1" } : {}),
              ...(searchActive ? { q: q.trim() } : {}),
            }}
            showBoundaryLinks
            onNavigate={(href) => {
              const nextPage = Number.parseInt(new URL(href, "http://local.invalid").searchParams.get("page") ?? "1", 10) || 1;
              loadList(liveTab, nextPage);
            }}
          />
        </div>
      </div>
      {searchPending || listPending ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--vp-wine)] px-3 py-1 text-[10px] font-medium text-[var(--vp-gold)] shadow-[var(--sh-md)]">
          {searchPending ? "Buscando…" : "Atualizando lista…"}
        </div>
      ) : null}
    </div>
  );
}
