export type InboxTab = "leads" | "groups" | "clientes" | "arquivados" | "perdidos";

/** Escopo da lista: abas fixas + "all" só no modo busca. */
export type InboxSearchScope = InboxTab | "all";

export type InboxTabCounts = Record<InboxTab, number>;
export type InboxUnreadCounts = Record<InboxTab, number>;

/** Filtro de responsável: todos | sem responsável | uuid do perfil. */
export type InboxOwnerFilter = null | "unassigned" | string;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inboxTabFromParam(value: string | null | undefined): InboxTab {
  if (
    value === "groups"
    || value === "clientes"
    || value === "arquivados"
    || value === "perdidos"
    || value === "leads"
  ) {
    return value;
  }
  if (value === "novos" || value === "pipeline" || value === "archived") {
    if (value === "archived") return "arquivados";
    return "leads";
  }
  return "leads";
}

export function inboxUnreadFromParam(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

export function inboxOwnerFromParam(value: string | null | undefined): InboxOwnerFilter {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw === "unassigned" || raw === "none") return "unassigned";
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  return null;
}

export function inboxOwnerRpcArgs(owner: InboxOwnerFilter | undefined): {
  p_owner_user_id: string | null;
  p_unassigned: boolean;
} {
  if (owner === "unassigned") {
    return { p_owner_user_id: null, p_unassigned: true };
  }
  if (typeof owner === "string" && owner) {
    return { p_owner_user_id: owner, p_unassigned: false };
  }
  return { p_owner_user_id: null, p_unassigned: false };
}

/** Admin vê qualquer owner; demais só todos / sem responsável / próprio usuário. */
export function constrainInboxOwnerFilter(
  owner: InboxOwnerFilter,
  input: { userId: string | null; canViewTeam: boolean },
): InboxOwnerFilter {
  if (owner == null || owner === "unassigned") return owner;
  if (input.canViewTeam) return owner;
  if (input.userId && owner === input.userId) return owner;
  return null;
}

export function formatUnreadBadge(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 100) return "99+";
  return String(Math.floor(n));
}

export function inboxSearchScopeFromParam(value: string | null | undefined): InboxSearchScope {
  if (value === "all") return "all";
  return inboxTabFromParam(value);
}

export function isInboxTab(value: string | null | undefined): value is InboxTab {
  return (
    value === "leads" ||
    value === "groups" ||
    value === "clientes" ||
    value === "arquivados" ||
    value === "perdidos"
  );
}

export function sumInboxTabCounts(counts: InboxTabCounts): number {
  return counts.leads + counts.groups + counts.clientes + counts.arquivados + counts.perdidos;
}

export function resolveInboxTabTotal(input: {
  unreadActive: boolean;
  tab: InboxSearchScope;
  tabTotal: number;
  tabCounts: InboxTabCounts;
}): number {
  if (input.unreadActive || input.tabTotal > 0) return input.tabTotal;
  return input.tab === "all"
    ? sumInboxTabCounts(input.tabCounts)
    : input.tabCounts[input.tab];
}

/**
 * No filtro «Não lidas», mantém na lista conversas já lidas nesta sessão
 * (estilo WhatsApp) ao refrescar o snapshot do servidor.
 */
export function mergeStickyUnreadConversations<T extends { id: string }>(
  serverRows: T[],
  previousRows: T[],
  readIds: ReadonlySet<string>,
  unreadActive: boolean,
): T[] {
  if (!unreadActive || readIds.size === 0) return serverRows;

  const serverById = new Map(serverRows.map((row) => [row.id, row] as const));
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const prev of previousRows) {
    const fromServer = serverById.get(prev.id);
    if (fromServer) {
      merged.push(fromServer);
      seen.add(prev.id);
      continue;
    }
    if (readIds.has(prev.id)) {
      merged.push(prev);
      seen.add(prev.id);
    }
  }

  for (const row of serverRows) {
    if (!seen.has(row.id)) merged.push(row);
  }

  return merged;
}

function appendOwnerParam(params: URLSearchParams, owner?: InboxOwnerFilter) {
  if (owner === "unassigned") params.set("owner", "unassigned");
  else if (typeof owner === "string" && owner) params.set("owner", owner);
}

export function inboxShareHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  lookup?: boolean;
  q?: string | null;
  unread?: boolean;
  owner?: InboxOwnerFilter;
}) {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) params.set("page", String(input.page));
  if (input.cid) params.set("cid", input.cid);
  if (input.lookup) params.set("lookup", "1");
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.unread) params.set("unread", "1");
  appendOwnerParam(params, input.owner);
  return `/inbox?${params.toString()}`;
}

/** Hash da aba/página para o cliente não disparar refetch RSC do App Router. */
export function inboxClientHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  unread?: boolean;
  owner?: InboxOwnerFilter;
}) {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) hash.set("page", String(input.page));
  if (input.cid) hash.set("cid", input.cid);
  if (input.unread) hash.set("unread", "1");
  appendOwnerParam(hash, input.owner);
  return `${url.pathname}${url.search}#${hash.toString()}`;
}

/** Sai da conversa sem perder aba, página e filtros. Tira `cid` da query e do hash. */
export function inboxHrefWithoutConversation(
  currentHref: string,
  input: {
    tab: InboxSearchScope;
    page: number;
    unread?: boolean;
    owner?: InboxOwnerFilter;
  },
) {
  const url = new URL(currentHref);
  url.searchParams.delete("cid");
  url.searchParams.delete("lookup");
  const hash = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) hash.set("page", String(input.page));
  if (input.unread) hash.set("unread", "1");
  appendOwnerParam(hash, input.owner);
  const hashValue = hash.toString();
  return `${url.pathname}${url.search}${hashValue ? `#${hashValue}` : ""}`;
}

export const INBOX_LOCATION_EVENT = "crm:inbox-location";

export function closeInboxConversation() {
  const current = readInboxLocation();
  const href = inboxHrefWithoutConversation(window.location.href, {
    tab: current.tab,
    page: current.page,
    unread: current.unread,
    owner: current.owner,
  });
  replaceInboxClientUrl(
    {
      inboxTab: current.tab,
      inboxPage: current.page,
      inboxUnread: current.unread,
      inboxOwner: current.owner,
    },
    href,
  );
  window.dispatchEvent(new Event(INBOX_LOCATION_EVENT));
}

function nativeHistory(
  method: "pushState" | "replaceState",
  state: object,
  href: string,
) {
  History.prototype[method].call(window.history, state, "", href);
}

export function pushInboxClientUrl(state: object, href: string) {
  nativeHistory("pushState", state, href);
}

export function replaceInboxClientUrl(state: object, href: string) {
  nativeHistory("replaceState", state, href);
}

export function readInboxLocation(href = window.location.href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hasHashTab = hash.has("tab");
  return {
    tab: inboxSearchScopeFromParam(hash.get("tab") ?? url.searchParams.get("tab")),
    page: Math.max(1, Number.parseInt(hash.get("page") ?? url.searchParams.get("page") ?? "1", 10) || 1),
    cid: hash.get("cid") ?? url.searchParams.get("cid"),
    unread: inboxUnreadFromParam(
      hasHashTab ? hash.get("unread") : url.searchParams.get("unread"),
    ),
    owner: inboxOwnerFromParam(
      hasHashTab ? hash.get("owner") : url.searchParams.get("owner"),
    ),
  };
}

/** Hash com `tab` = navegação client-side; searchParams do RSC não são a fonte da verdade. */
export function inboxClientHashOwnsNavigation(href = window.location.href): boolean {
  const url = new URL(href, "http://local.invalid");
  return new URLSearchParams(url.hash.replace(/^#/, "")).has("tab");
}

/** RSC refresh após server action traz searchParams sem hash — não aplicar se divergir. */
export function inboxServerSnapshotMatchesClient(
  server: { tab: InboxSearchScope; page: number; unread: boolean; owner?: InboxOwnerFilter },
  client: { tab: InboxSearchScope; page: number; unread: boolean; owner?: InboxOwnerFilter },
): boolean {
  return (
    server.tab === client.tab
    && server.page === client.page
    && server.unread === client.unread
    && (server.owner ?? null) === (client.owner ?? null)
  );
}

/**
 * Flyout da rail: troca tab/responsável sem derrubar o chip «Não lidas».
 * Opção já ativa → só fecha o menu (sem reload).
 */
export function resolveInboxOwnerFilterSelection(input: {
  currentTab: InboxSearchScope;
  currentOwner: InboxOwnerFilter;
  nextTab: InboxTab;
  nextOwner: InboxOwnerFilter;
  unreadOnly: boolean;
}): { reload: false } | {
  reload: true;
  tab: InboxTab;
  owner: InboxOwnerFilter;
  unread: boolean;
} {
  const sameTab = input.currentTab === input.nextTab;
  const sameOwner = (input.currentOwner ?? null) === (input.nextOwner ?? null);
  if (sameTab && sameOwner) return { reload: false };
  return {
    reload: true,
    tab: input.nextTab,
    owner: input.nextOwner,
    unread: input.unreadOnly,
  };
}
