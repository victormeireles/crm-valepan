"use client";

import {
  loadInboxOwnerUnreadCounts,
  markConversationUnread,
  refreshInboxSidebar,
  refreshInboxSidebarConversation,
  updateConversationContactName,
  type InboxOwnerUnreadRow,
} from "@/app/actions/inbox";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactAvatar } from "@/components/contact-avatar";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";
import { PaginationNav } from "@/components/pagination-nav";
import { isInboxSearchQuery, isPhoneSearchQuery } from "@/lib/phone-search-query";
import { formatAbsoluteShort, formatElapsedShort } from "@/lib/format-relative";
import { INBOX_SELECT_CONVERSATION_EVENT } from "./inbox-conversation-pane";
import {
  INBOX_SIDEBAR_CHANGED_EVENT,
  INBOX_SIDEBAR_ROW_CHANGED_EVENT,
  type InboxSidebarRowChangedDetail,
} from "./inbox-live-refresh";
import {
  formatUnreadBadge,
  inboxClientHashOwnsNavigation,
  inboxClientHref,
  inboxServerSnapshotMatchesClient,
  inboxShareHref,
  isInboxTab,
  mergeStickyUnreadConversations,
  pushInboxClientUrl,
  readInboxLocation,
  replaceInboxClientUrl,
  resolveInboxOwnerFilterSelection,
  resolveInboxTabTotal,
  sumInboxTabCounts,
  type InboxOwnerFilter,
  type InboxSearchScope,
  type InboxTab,
  type InboxTabCounts,
  type InboxUnreadCounts,
} from "./inbox-location";
import { recordInboxBrowserMetric } from "@/lib/inbox-browser-performance";
import {
  fetchInboxSidebarCached,
  inboxSidebarCacheKey,
  invalidateInboxSidebarCache,
  readInboxSidebarCache,
  readOwnerCountsCache,
  writeInboxSidebarCache,
  writeOwnerCountsCache,
  type InboxSidebarRefreshOk,
} from "@/lib/inbox/sidebar-list-cache";
import { ownerChipColor, ownerInitial } from "@/lib/owner-chip";
import {
  callStatusFromEvent,
  conversationActivityChanged,
  moveConversationToFront as moveConversationToFrontOrdered,
  patchConversationInPlace,
  sidebarPreview,
} from "./inbox-sidebar-order";

function isUnreadFromTimestamps(
  lastInboundSentAt: string | null | undefined,
  lastReadAt: string | null | undefined,
): boolean {
  if (!lastInboundSentAt) return false;
  if (!lastReadAt?.trim()) return true;
  return lastInboundSentAt > lastReadAt;
}

function bumpUnreadCount(
  counts: InboxUnreadCounts,
  tab: InboxTab,
  delta: number,
): InboxUnreadCounts {
  if (!delta) return counts;
  return { ...counts, [tab]: Math.max(0, counts[tab] + delta) };
}

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
  ownerId: string | null;
  ownerName: string | null;
};

function moveConversationToFront(rows: InboxSidebarRow[], next: InboxSidebarRow): InboxSidebarRow[] {
  return moveConversationToFrontOrdered(rows, next, PAGE_SIZE);
}

function OwnerInitialChip({
  ownerId,
  ownerName,
}: {
  ownerId: string;
  ownerName: string | null;
}) {
  const color = ownerChipColor(ownerId);
  const label = (ownerName ?? "").trim() || "Responsável";
  return (
    <span
      className="grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-extrabold leading-none"
      style={{ backgroundColor: color.bg, color: color.fg }}
      title={`Responsável: ${label}`}
      aria-label={`Responsável: ${label}`}
      role="img"
    >
      {ownerInitial(ownerName)}
    </span>
  );
}

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

function firstName(label: string): string {
  const part = label.trim().split(/\s+/)[0];
  return part || label;
}

function conversationMatchesOwnerFilter(
  conversation: { ownerId: string | null },
  owner: InboxOwnerFilter,
): boolean {
  if (owner == null) return true;
  if (owner === "unassigned") return !conversation.ownerId;
  return conversation.ownerId === owner;
}

function ownerFilterLabelFromOptions(
  owner: InboxOwnerFilter,
  teamOptions: { id: string; label: string }[],
  opts?: { currentUserId?: string | null; canViewTeam?: boolean },
): string | null {
  if (owner === "unassigned") return "Sem responsável";
  if (typeof owner === "string") {
    if (opts?.currentUserId && owner === opts.currentUserId && !opts.canViewTeam) return "Eu";
    return teamOptions.find((option) => option.id === owner)?.label ?? "Responsável";
  }
  return null;
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
  ownerFilter = null,
  ownerFilterLabel = null,
  canViewTeam = false,
  currentUserId = null,
  teamOptions = [],
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
  ownerFilter?: InboxOwnerFilter;
  ownerFilterLabel?: string | null;
  canViewTeam?: boolean;
  currentUserId?: string | null;
  teamOptions?: { id: string; label: string }[];
}) {
  const initialSearch = isInboxSearchQuery(initialQuery);
  const [nowMs, setNowMs] = useState(renderNowMs);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [liveTab, setLiveTab] = useState<InboxSearchScope>(activeTab);
  const [livePage, setLivePage] = useState(page);
  const [listPending, setListPending] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [liveConversations, setLiveConversations] = useState(conversations);
  const [liveUnreadCounts, setLiveUnreadCounts] = useState(unreadCounts);
  const [liveUnreadOnly, setLiveUnreadOnly] = useState(unreadOnly);
  const [liveOwnerFilter, setLiveOwnerFilter] = useState<InboxOwnerFilter>(ownerFilter);
  const [liveOwnerFilterLabel, setLiveOwnerFilterLabel] = useState<string | null>(ownerFilterLabel);
  const [ownerFlyoutTab, setOwnerFlyoutTab] = useState<InboxTab | null>(null);
  const [ownerUnreadRows, setOwnerUnreadRows] = useState<InboxOwnerUnreadRow[]>([]);
  const [ownerCountsPending, setOwnerCountsPending] = useState(false);
  const [liveTabTotal, setLiveTabTotal] = useState(
    tabTotal ?? (activeTab === "all" ? sumInboxTabCounts(tabCounts) : tabCounts[activeTab]),
  );
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(selectedId);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openMenuPos, setOpenMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
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
  const liveOwnerFilterRef = useRef(liveOwnerFilter);
  liveOwnerFilterRef.current = liveOwnerFilter;
  const liveConversationsRef = useRef(liveConversations);
  liveConversationsRef.current = liveConversations;
  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;
  const tabBeforeSearchRef = useRef<InboxTab>(isInboxTab(activeTab) ? activeTab : "leads");
  const searchModeRef = useRef(initialSearch);
  const skipSearchBootstrapRef = useRef(initialSearch);
  const ownerCountsRequestRef = useRef(0);

  const searchActive = isInboxSearchQuery(q);
  const paginationTotal = liveTabTotal;

  const scopeUnreadCount = unreadCountForScope(liveUnreadCounts, liveTab);
  const scopeUnreadBadge = formatUnreadBadge(scopeUnreadCount);
  const ownerFilterActive = liveOwnerFilter != null;
  const ownerFilterChipLabel = liveOwnerFilterLabel
    ? firstName(liveOwnerFilterLabel)
    : ownerFilterActive
      ? "Responsável"
      : null;

  const conversationHref = (conversationId: string) =>
    inboxShareHref({
      tab: liveTab,
      page: livePage,
      cid: conversationId,
      lookup: searchActive && isPhoneSearchQuery(q),
      q: searchActive ? q.trim() : null,
      unread: liveUnreadOnly,
      owner: liveOwnerFilter,
    });

  const applySidebarResult = useCallback((
    tab: InboxSearchScope,
    nextPage: number,
    result: InboxSidebarRefreshOk,
    startedAt: number,
    unreadActive: boolean,
    mode: "push" | "replace" | "silent",
    meta?: { cacheHit?: boolean; serverMs?: number },
  ) => {
    recordInboxBrowserMetric("sidebar_refresh", startedAt, {
      success: true,
      rows: result.conversations.length,
      cacheHit: Boolean(meta?.cacheHit),
      serverMs: meta?.serverMs ?? result.serverMs ?? null,
      authMs: result.operationMs?.auth_user ?? null,
      snapshotMs: result.operationMs?.sidebar_snapshot ?? null,
      stagesMs: result.operationMs?.pipeline_stages ?? null,
      profileMs: result.operationMs?.caller_profile ?? null,
    });
    setLiveTab(tab);
    setLivePage(nextPage);
    setLiveUnreadCounts(result.unreadCounts);
    setReadIds((previous) => {
      const next = new Set(previous);
      result.conversations.forEach((conversation) => {
        if (conversation.unread) next.delete(conversation.id);
      });
      return next;
    });

    // Sticky só no refresh em tempo real enquanto o filtro «Não lidas» já está ativo.
    // Troca de filtro/rail/página usa o snapshot puro do servidor.
    const merged = mergeStickyUnreadConversations(
      result.conversations,
      liveConversationsRef.current,
      readIdsRef.current,
      unreadActive && mode === "silent",
    );
    setLiveConversations(merged);
    const stickyExtra = Math.max(0, merged.length - result.conversations.length);
    setLiveTabTotal(
      unreadActive
        ? result.tabTotal + stickyExtra
        : resolveInboxTabTotal({
            unreadActive,
            tab,
            tabTotal: result.tabTotal,
            tabCounts: result.tabCounts,
          }),
    );
  }, []);

  const prefetchSidebarList = useCallback((input: {
    tab: InboxSearchScope;
    page?: number;
    query?: string | null;
    unread?: boolean;
    owner?: InboxOwnerFilter;
  }) => {
    const page = input.page ?? 1;
    const key = inboxSidebarCacheKey({
      tab: input.tab,
      page,
      query: input.query,
      unread: input.unread,
      owner: input.owner,
    });
    if (readInboxSidebarCache(key)) return;
    void fetchInboxSidebarCached(
      {
        tab: input.tab,
        page,
        query: input.query ?? null,
        unread: Boolean(input.unread),
        owner: input.owner ?? null,
      },
      refreshInboxSidebar,
    );
  }, []);

  const loadList = useCallback((
    tab: InboxSearchScope,
    nextPage: number,
    mode: "push" | "replace" | "silent" = "push",
    query?: string | null,
    unread?: boolean,
    owner?: InboxOwnerFilter,
  ) => {
    const startedAt = performance.now();
    const version = ++requestVersion.current;
    const activeQuery = query === undefined
      ? (isInboxSearchQuery(qRef.current) ? qRef.current.trim() : null)
      : query?.trim() || null;
    const unreadFilter = unread === undefined ? liveUnreadOnlyRef.current : unread;
    const ownerNext = owner === undefined ? liveOwnerFilterRef.current : owner;
    const nextOwnerLabel = ownerFilterLabelFromOptions(ownerNext, teamOptions, {
      currentUserId,
      canViewTeam,
    });
    const requestInput = {
      tab,
      page: nextPage,
      query: activeQuery,
      unread: unreadFilter,
      owner: ownerNext,
    };
    const cacheKey = inboxSidebarCacheKey(requestInput);
    const cached = mode === "silent" ? null : readInboxSidebarCache(cacheKey);

    setLiveTab(tab);
    setLivePage(nextPage);
    setLiveUnreadOnly(unreadFilter);
    setLiveOwnerFilter(ownerNext);
    setLiveOwnerFilterLabel(nextOwnerLabel);
    if (mode !== "silent") {
      const href = inboxClientHref({
        tab,
        page: nextPage,
        cid: selectedIdRef.current,
        unread: unreadFilter,
        owner: ownerNext,
      });
      const historyState = {
        inboxTab: tab,
        inboxPage: nextPage,
        inboxConversationId: selectedIdRef.current,
        inboxUnread: unreadFilter,
        inboxOwner: ownerNext,
      };
      if (mode === "push") pushInboxClientUrl(historyState, href);
      else replaceInboxClientUrl(historyState, href);
    }

    if (cached) {
      applySidebarResult(tab, nextPage, cached, startedAt, unreadFilter, mode, { cacheHit: true });
      setListPending(false);
      setListRefreshing(true);
      setSearchPending(false);
      setSearchError(null);
      // Prefetch do par Tudo/Não lidas para o mesmo responsável.
      prefetchSidebarList({
        tab,
        page: 1,
        query: activeQuery,
        unread: !unreadFilter,
        owner: ownerNext,
      });
    } else if (mode !== "silent") {
      // Mantém a lista visível (só skeleton se ainda não há linhas).
      if (liveConversationsRef.current.length === 0) setListPending(true);
      else setListRefreshing(true);
    }

    void fetchInboxSidebarCached(requestInput, refreshInboxSidebar, { force: Boolean(cached) || mode === "silent" })
      .then((result) => {
        if (version !== requestVersion.current) return;
        if (!result) {
          recordInboxBrowserMetric("sidebar_refresh", startedAt, { success: false, rows: 0 });
          if (mode !== "silent") {
            setListPending(false);
            setListRefreshing(false);
          }
          setSearchPending(false);
          setSearchError("Não foi possível atualizar a lista. Tente novamente.");
          return;
        }
        applySidebarResult(tab, nextPage, result, startedAt, unreadFilter, mode, {
          cacheHit: false,
          serverMs: result.serverMs,
        });
        if (mode !== "silent") {
          setListPending(false);
          setListRefreshing(false);
        }
        setSearchPending(false);
        setSearchError(null);
        prefetchSidebarList({
          tab,
          page: 1,
          query: activeQuery,
          unread: !unreadFilter,
          owner: ownerNext,
        });
      })
      .catch(() => {
        if (version !== requestVersion.current) return;
        recordInboxBrowserMetric("sidebar_refresh", startedAt, { success: false, rows: 0 });
        if (mode !== "silent") {
          setListPending(false);
          setListRefreshing(false);
        }
        setSearchPending(false);
        setSearchError("Não foi possível atualizar a lista. Tente novamente.");
      });
  }, [applySidebarResult, canViewTeam, currentUserId, prefetchSidebarList, teamOptions]);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    // Contagens podem atualizar após server action; filtro/página vivem no hash.
    setLiveUnreadCounts(unreadCounts);

    // Após salvar responsável/etapa etc., o Next pode re-renderizar o RSC com
    // searchParams (sem hash) → props «Tudo» p.1. Não clobber a navegação client.
    if (inboxClientHashOwnsNavigation()) {
      const client = readInboxLocation();
      const serverMatches = inboxServerSnapshotMatchesClient(
        { tab: activeTab, page, unread: unreadOnly, owner: ownerFilter },
        { tab: client.tab, page: client.page, unread: client.unread, owner: client.owner },
      );
      if (!serverMatches) {
        const liveMatches = inboxServerSnapshotMatchesClient(
          {
            tab: liveTabRef.current,
            page: livePageRef.current,
            unread: liveUnreadOnlyRef.current,
            owner: liveOwnerFilterRef.current,
          },
          { tab: client.tab, page: client.page, unread: client.unread, owner: client.owner },
        );
        // Remount com state inicial errado: recupera a lista do hash sem skeleton.
        if (!liveMatches) {
          loadList(client.tab, client.page, "silent", undefined, client.unread, client.owner);
        }
        return;
      }
    }

    setLiveUnreadOnly(unreadOnly);
    setLiveOwnerFilter(ownerFilter);
    setLiveOwnerFilterLabel(ownerFilterLabel);
    setLiveTab(activeTab);
    setLivePage(page);
    writeInboxSidebarCache(
      inboxSidebarCacheKey({
        tab: activeTab,
        page,
        query: isInboxSearchQuery(initialQuery) ? initialQuery.trim() : null,
        unread: unreadOnly,
        owner: ownerFilter,
      }),
      {
        ok: true,
        conversations: conversations.map((row) => ({
          ...row,
          avatarUrl: row.avatarUrl ?? null,
        })),
        tabCounts,
        unreadCounts,
        tabTotal: tabTotal ?? (
          activeTab === "all"
            ? sumInboxTabCounts(tabCounts)
            : isInboxTab(activeTab)
              ? tabCounts[activeTab]
              : sumInboxTabCounts(tabCounts)
        ),
      },
    );
    // Em «Não lidas», preserva conversas já lidas nesta sessão se o RSC
    // revalidar a página (ex.: troca de etapa com router.refresh).
    if (unreadOnly) {
      const merged = mergeStickyUnreadConversations(
        conversations,
        liveConversationsRef.current,
        readIdsRef.current,
        true,
      );
      setLiveConversations(merged);
      const baseTotal = tabTotal ?? conversations.length;
      setLiveTabTotal(baseTotal + Math.max(0, merged.length - conversations.length));
      return;
    }
    setLiveConversations(conversations);
    setLiveTabTotal(
      tabTotal ?? (activeTab === "all" ? sumInboxTabCounts(tabCounts) : isInboxTab(activeTab) ? tabCounts[activeTab] : sumInboxTabCounts(tabCounts)),
    );
  }, [conversations, tabCounts, unreadCounts, unreadOnly, ownerFilter, ownerFilterLabel, tabTotal, activeTab, page, loadList, initialQuery]);

  useEffect(() => {
    const onOwnerChanged = (event: Event) => {
      const detail = (event as CustomEvent<{
        conversationId?: string;
        ownerId?: string | null;
        ownerName?: string | null;
      }>).detail;
      if (!detail?.conversationId) return;
      setLiveConversations((rows) => {
        const nextRows = rows.map((row) =>
          row.id === detail.conversationId
            ? {
                ...row,
                ownerId: detail.ownerId ?? null,
                ownerName: detail.ownerName ?? null,
              }
            : row,
        );
        const owner = liveOwnerFilterRef.current;
        if (owner == null) return nextRows;
        const filtered = nextRows.filter((row) => conversationMatchesOwnerFilter(row, owner));
        if (filtered.length !== nextRows.length) {
          setLiveTabTotal((total) => Math.max(0, total - (nextRows.length - filtered.length)));
        }
        return filtered;
      });
    };
    window.addEventListener("crm:inbox-lead-owner-changed", onOwnerChanged);
    return () => window.removeEventListener("crm:inbox-lead-owner-changed", onOwnerChanged);
  }, []);

  useEffect(() => {
    const refresh = () => {
      invalidateInboxSidebarCache();
      loadList(liveTabRef.current, livePageRef.current, "silent");
    };
    window.addEventListener(INBOX_SIDEBAR_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(INBOX_SIDEBAR_CHANGED_EVENT, refresh);
  }, [loadList]);

  useEffect(() => {
    const inflight = new Set<string>();

    const applyFetchedRow = (
      conversation: InboxSidebarRow,
      railTab: InboxTab,
      wasUnread: boolean,
    ) => {
      const nowUnread = conversation.unread && !readIdsRef.current.has(conversation.id);
      const unreadDelta = Number(nowUnread) - Number(wasUnread);
      if (unreadDelta) {
        setLiveUnreadCounts((counts) => bumpUnreadCount(counts, railTab, unreadDelta));
      }

      const tab = liveTabRef.current;
      const unreadOnly = liveUnreadOnlyRef.current;
      const searching = isInboxSearchQuery(qRef.current);
      const belongsToTab = tab === "all"
        || (tab === "groups" && conversation.kind === "group")
        || (tab !== "groups" && conversation.kind === "lead" && railTab === tab);

      if (searching) return;
      if (unreadOnly && !nowUnread && !readIdsRef.current.has(conversation.id)) return;
      if (!belongsToTab) return;
      if (!conversationMatchesOwnerFilter(conversation, liveOwnerFilterRef.current)) return;
      // Página > 1: só badge (já atualizado acima).
      if (livePageRef.current > 1) return;

      setLiveConversations((rows) => {
        const exists = rows.some((row) => row.id === conversation.id);
        const next = moveConversationToFront(rows, conversation);
        if (!exists && (unreadOnly || nowUnread)) {
          setLiveTabTotal((total) => total + 1);
        }
        return next;
      });
      if (nowUnread) {
        setReadIds((previous) => {
          if (!previous.has(conversation.id)) return previous;
          const next = new Set(previous);
          next.delete(conversation.id);
          return next;
        });
      }
    };

    const onRowChanged = (event: Event) => {
      const detail = (event as CustomEvent<InboxSidebarRowChangedDetail>).detail;
      if (!detail?.conversationId) return;

      const existing = liveConversationsRef.current.find((row) => row.id === detail.conversationId);
      if (existing) {
        const wasUnread = existing.unread && !readIdsRef.current.has(existing.id);
        const nextUnread = isUnreadFromTimestamps(detail.lastInboundSentAt, detail.lastReadAt);
        const patched: InboxSidebarRow = {
          ...existing,
          preview: sidebarPreview(detail.lastBodyPreview),
          lastAt: detail.lastMessageAt ?? existing.lastAt,
          lastDirection: detail.lastDirection,
          awaiting: detail.lastDirection === "in",
          unread: nextUnread,
          callStatus: callStatusFromEvent(detail.lastEventKind, detail.lastEventStatus),
        };

        const unreadOnly = liveUnreadOnlyRef.current;
        const stickyRead =
          readIdsRef.current.has(existing.id) || selectedIdRef.current === existing.id;
        if (unreadOnly && !nextUnread && !stickyRead) {
          // Someu do filtro no servidor; sticky só se o usuário leu nesta sessão.
          setLiveConversations((rows) => rows.filter((row) => row.id !== existing.id));
          setLiveTabTotal((total) => Math.max(0, total - 1));
        } else {
          // Abrir/marcar lida não deve puxar o card pro topo (página 3 ficava “pulando”).
          if (selectedIdRef.current === existing.id && !readIdsRef.current.has(existing.id)) {
            setReadIds((previous) => new Set(previous).add(existing.id));
          }
          const bump =
            conversationActivityChanged(existing, detail) && livePageRef.current === 1;
          setLiveConversations((rows) =>
            bump ? moveConversationToFront(rows, patched) : patchConversationInPlace(rows, patched),
          );
        }

        if (nextUnread !== wasUnread && isInboxTab(liveTabRef.current)) {
          // Ajuste otimista no badge da aba atual; reconcile corrige depois.
          setLiveUnreadCounts((counts) =>
            bumpUnreadCount(counts, liveTabRef.current as InboxTab, nextUnread ? 1 : -1),
          );
        } else if (nextUnread !== wasUnread) {
          // Aba "all": bump em leads por padrão até o reconcile.
          setLiveUnreadCounts((counts) => bumpUnreadCount(counts, "leads", nextUnread ? 1 : -1));
        }

        if (nextUnread) {
          setReadIds((previous) => {
            if (!previous.has(existing.id)) return previous;
            const next = new Set(previous);
            next.delete(existing.id);
            return next;
          });
        }
        return;
      }

      // Fora da lista: só busca 1 linha se puder aparecer na página atual.
      if (inflight.has(detail.conversationId)) return;
      if (isInboxSearchQuery(qRef.current)) return;
      const becomesUnread = isUnreadFromTimestamps(detail.lastInboundSentAt, detail.lastReadAt);
      const onFirstPage = livePageRef.current === 1;
      const wantUnreadInsert = liveUnreadOnlyRef.current && becomesUnread;
      if (!onFirstPage && !wantUnreadInsert) return;
      if (liveUnreadOnlyRef.current && !becomesUnread) return;

      inflight.add(detail.conversationId);
      void refreshInboxSidebarConversation(detail.conversationId)
        .then((result) => {
          if (!result.ok) return;
          applyFetchedRow(result.conversation, result.railTab, false);
        })
        .finally(() => {
          inflight.delete(detail.conversationId);
        });
    };

    window.addEventListener(INBOX_SIDEBAR_ROW_CHANGED_EVENT, onRowChanged);
    return () => window.removeEventListener(INBOX_SIDEBAR_ROW_CHANGED_EVENT, onRowChanged);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = readInboxLocation();
      loadList(next.tab, next.page, "silent", undefined, next.unread, next.owner);
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
    // cid também fica no hash; RSC sem cid na query não deve apagar a seleção.
    if (inboxClientHashOwnsNavigation()) {
      const cid = readInboxLocation().cid;
      if (cid) {
        setOptimisticSelectedId(cid);
        return;
      }
    }
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
      // No filtro «Não lidas», mantém a linha na lista (sticky) até trocar
      // filtro, rail ou recarregar — só some o ponto e cai o contador.
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
    setOpenMenuPos(null);
    if (wasUnread) return;
    if (isInboxTab(tab)) {
      setLiveUnreadCounts((counts) => ({ ...counts, [tab]: counts[tab] + 1 }));
    } else {
      loadList(tab, livePageRef.current, "silent");
    }
  }, [loadList]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => {
      setOpenMenuId(null);
      setOpenMenuPos(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[role="menu"], [aria-label="Mais ações da conversa"]')) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [openMenuId]);

  const setUnreadFilter = (next: boolean) => {
    if (next === liveUnreadOnly) return;
    loadList(liveTab, 1, "push", undefined, next);
  };

  const closeOwnerFlyout = useCallback(() => {
    setOwnerFlyoutTab(null);
  }, []);

  const openOwnerFlyout = useCallback((tab: InboxTab) => {
    setOwnerFlyoutTab(tab);
    const cachedRows = readOwnerCountsCache<InboxOwnerUnreadRow[]>(tab);
    if (cachedRows) {
      setOwnerUnreadRows(cachedRows);
      setOwnerCountsPending(false);
    } else {
      setOwnerCountsPending(true);
    }
    const requestId = ++ownerCountsRequestRef.current;
    void loadInboxOwnerUnreadCounts(tab).then((result) => {
      if (requestId !== ownerCountsRequestRef.current) return;
      setOwnerCountsPending(false);
      if (!result.ok) {
        if (!cachedRows) setOwnerUnreadRows([]);
        return;
      }
      writeOwnerCountsCache(tab, result.rows);
      setOwnerUnreadRows(result.rows);
    }).catch(() => {
      if (requestId !== ownerCountsRequestRef.current) return;
      setOwnerCountsPending(false);
      if (!cachedRows) setOwnerUnreadRows([]);
    });
  }, []);

  const selectOwnerFilter = (tab: InboxTab, owner: InboxOwnerFilter) => {
    setOwnerFlyoutTab(null);
    const next = resolveInboxOwnerFilterSelection({
      currentTab: liveTab,
      currentOwner: liveOwnerFilter,
      nextTab: tab,
      nextOwner: owner,
      unreadOnly: liveUnreadOnly,
    });
    if (!next.reload) return;
    loadList(next.tab, 1, "push", undefined, next.unread, next.owner);
  };

  const selectRailTab = (tab: InboxTab) => {
    if (ownerFlyoutTab === tab) {
      closeOwnerFlyout();
      return;
    }
    openOwnerFlyout(tab);
  };

  useEffect(() => {
    if (!ownerFlyoutTab) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOwnerFlyout();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-inbox-owner-flyout], [data-inbox-rail]")) return;
      closeOwnerFlyout();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [ownerFlyoutTab, closeOwnerFlyout]);

  const flyoutTabLabel = ownerFlyoutTab
    ? INBOX_RAIL.find((item) => item.tab === ownerFlyoutTab)?.label ?? "Lista"
    : null;

  return (
    <div
      aria-busy={searchPending || listPending || listRefreshing}
      className="relative flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <nav
        data-inbox-rail
        aria-label="Listas do inbox"
        className="relative z-30 flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--vp-ink-line)] bg-[var(--vp-paper)] py-2"
      >
        {INBOX_RAIL.map(({ tab, label, icon }) => {
          const active = liveTab === tab;
          const flyoutOpen = ownerFlyoutTab === tab;
          const badge = formatUnreadBadge(liveUnreadCounts[tab]);
          return (
            <button
              key={tab}
              type="button"
              title={`${label}: filtrar por responsável`}
              aria-label={badge ? `${label}, ${badge} não lidas` : label}
              aria-current={active ? "page" : undefined}
              aria-expanded={flyoutOpen}
              aria-haspopup="menu"
              onClick={() => selectRailTab(tab)}
              className={`relative flex size-10 items-center justify-center rounded-xl text-[22px] transition-colors duration-200 ${
                active || flyoutOpen
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
      {ownerFlyoutTab ? (
        <>
          <button
            type="button"
            aria-label="Fechar filtro de responsável"
            onClick={closeOwnerFlyout}
            className="absolute inset-y-0 left-14 right-0 z-10 cursor-default border-0 bg-[rgba(35,0,4,0.28)] p-0 motion-safe:animate-[inbox-owner-scrim-in_180ms_ease-out]"
          />
          <div
            data-inbox-owner-flyout
            role="menu"
            aria-label={`Responsável em ${flyoutTabLabel}`}
            className="absolute inset-y-0 left-14 z-20 flex w-[220px] flex-col border-r border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-md)] motion-safe:animate-[inbox-owner-flyout-in_200ms_ease-out]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--vp-ink-line)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--vp-ink-soft)]">
                  Responsável
                </p>
                <p className="truncate text-sm font-bold text-[var(--vp-ink-body)]">{flyoutTabLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar filtro de responsável"
                onClick={closeOwnerFlyout}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--vp-ink-soft)] transition-colors duration-200 hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-ink-body)]"
              >
                <CrmIcon name="close" className="text-[18px]" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              {ownerCountsPending ? (
                <div className="space-y-2 px-3 py-3" aria-busy="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <span
                      key={`owner-skeleton-${index}`}
                      className="block h-10 animate-pulse rounded-lg bg-[var(--vp-surface-high)]"
                    />
                  ))}
                </div>
              ) : (
                ownerUnreadRows.map((row) => {
                  const optionOwner: InboxOwnerFilter = row.isAll
                    ? null
                    : row.ownerId
                      ? row.ownerId
                      : "unassigned";
                  const selected =
                    liveTab === ownerFlyoutTab
                    && (
                      row.isAll
                        ? liveOwnerFilter == null
                        : row.ownerId
                          ? liveOwnerFilter === row.ownerId
                          : liveOwnerFilter === "unassigned"
                    );
                  const badge = formatUnreadBadge(row.unreadCount);
                  return (
                    <button
                      key={row.isAll ? "all" : row.ownerId ?? "unassigned"}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onMouseEnter={() => {
                        if (!ownerFlyoutTab) return;
                        prefetchSidebarList({
                          tab: ownerFlyoutTab,
                          page: 1,
                          unread: liveUnreadOnly,
                          owner: optionOwner,
                        });
                      }}
                      onFocus={() => {
                        if (!ownerFlyoutTab) return;
                        prefetchSidebarList({
                          tab: ownerFlyoutTab,
                          page: 1,
                          unread: liveUnreadOnly,
                          owner: optionOwner,
                        });
                      }}
                      onClick={() => selectOwnerFilter(ownerFlyoutTab, optionOwner)}
                      className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] transition-colors duration-150 hover:bg-[var(--vp-surface)] ${
                        selected ? "bg-[rgba(35,0,4,0.06)] font-bold text-[var(--vp-wine)]" : "text-[var(--vp-ink-muted)]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {row.isAll
                          ? "Todos"
                          : !row.ownerId
                            ? "Sem responsável"
                            : currentUserId && row.ownerId === currentUserId && !canViewTeam
                              ? "Eu"
                              : firstName(row.ownerName)}
                      </span>
                      {badge ? (
                        <span className="shrink-0 rounded-full bg-[var(--vp-wine)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--vp-paper-pure)]">
                          {badge}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] tabular-nums opacity-50">0</span>
                      )}
                      {selected ? <CrmIcon name="check" className="shrink-0 text-base" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : null}
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
          <div role="tablist" aria-label="Filtro de leitura" className="mt-2 flex flex-wrap gap-1.5">
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
            {ownerFilterChipLabel ? (
              <button
                type="button"
                aria-label={`Limpar filtro de responsável: ${liveOwnerFilterLabel ?? ownerFilterChipLabel}`}
                onClick={() => loadList(liveTab, 1, "push", undefined, liveUnreadOnly, null)}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[rgba(35,0,4,0.09)] px-3 py-1 text-xs font-bold text-[var(--vp-wine)] transition-colors duration-150 hover:bg-[rgba(35,0,4,0.14)]"
              >
                <span className="truncate">{ownerFilterChipLabel}</span>
                <CrmIcon name="close" className="shrink-0 text-[14px]" />
              </button>
            ) : null}
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
        <ul
          className={`min-h-0 flex-1 divide-y divide-[var(--vp-surface-high)] overflow-y-auto overscroll-contain transition-opacity duration-150 ${
            listRefreshing && !listPending ? "opacity-60" : "opacity-100"
          }`}
        >
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
                        const href = inboxClientHref({
                          tab: liveTab,
                          page: livePage,
                          cid: c.id,
                          unread: liveUnreadOnly,
                          owner: liveOwnerFilter,
                        });
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
                          <div className="flex items-center gap-2">
                            <span className={`min-w-0 truncate text-sm text-[var(--vp-ink-body)] ${showUnread ? "font-extrabold" : "font-bold"}`}>
                              {c.identityName}
                            </span>
                            {c.ownerId ? (
                              <OwnerInitialChip ownerId={c.ownerId} ownerName={c.ownerName} />
                            ) : null}
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
                        aria-expanded={openMenuId === c.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (openMenuId === c.id) {
                            setOpenMenuId(null);
                            setOpenMenuPos(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          // ~2 itens + padding; reserva a barra de paginação (~52px).
                          const menuHeight = c.kind === "lead" ? 84 : 48;
                          const spaceBelow = window.innerHeight - rect.bottom - 56;
                          const openUp = spaceBelow < menuHeight;
                          setOpenMenuPos({
                            right: Math.max(8, window.innerWidth - rect.right),
                            ...(openUp
                              ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) }
                              : { top: rect.bottom + 4 }),
                          });
                          setOpenMenuId(c.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-[var(--muted)] hover:bg-[rgba(35,0,4,0.08)] hover:text-[var(--foreground)]"
                      >
                        ▾
                      </button>
                      {openMenuId === c.id && openMenuPos ? (
                        <div
                          role="menu"
                          className="fixed z-[80] min-w-[10rem] rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1 shadow-[var(--sh-md)]"
                          style={{
                            top: openMenuPos.top,
                            bottom: openMenuPos.bottom,
                            right: openMenuPos.right,
                          }}
                        >
                          <button
                            type="button"
                            role="menuitem"
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
                              role="menuitem"
                              disabled={savingId === c.id}
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const next = window.prompt("Editar nome do contato", c.displayName);
                                if (next == null) {
                                  setOpenMenuId(null);
                                  setOpenMenuPos(null);
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
                                setOpenMenuPos(null);
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
                  : ownerFilterActive
                    ? "Nenhuma conversa com este responsável."
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
              ...(liveOwnerFilter === "unassigned"
                ? { owner: "unassigned" }
                : typeof liveOwnerFilter === "string"
                  ? { owner: liveOwnerFilter }
                  : {}),
              ...(searchActive ? { q: q.trim() } : {}),
            }}
            onNavigate={(href) => {
              const nextPage = Number.parseInt(new URL(href, "http://local.invalid").searchParams.get("page") ?? "1", 10) || 1;
              loadList(liveTab, nextPage);
            }}
          />
        </div>
      </div>
    </div>
  );
}
