export type InboxTab = "leads" | "groups" | "clientes" | "perdidos";

/** Escopo da lista: abas fixas + "all" só no modo busca. */
export type InboxSearchScope = InboxTab | "all";

export type InboxTabCounts = Record<InboxTab, number>;
export type InboxUnreadCounts = Record<InboxTab, number>;

export function inboxTabFromParam(value: string | null | undefined): InboxTab {
  if (value === "groups" || value === "clientes" || value === "perdidos" || value === "leads") {
    return value;
  }
  if (value === "novos" || value === "pipeline" || value === "archived") {
    if (value === "archived") return "clientes";
    return "leads";
  }
  return "leads";
}

export function inboxUnreadFromParam(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
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
    value === "perdidos"
  );
}

export function sumInboxTabCounts(counts: InboxTabCounts): number {
  return counts.leads + counts.groups + counts.clientes + counts.perdidos;
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

export function inboxShareHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  lookup?: boolean;
  q?: string | null;
  unread?: boolean;
}) {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) params.set("page", String(input.page));
  if (input.cid) params.set("cid", input.cid);
  if (input.lookup) params.set("lookup", "1");
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.unread) params.set("unread", "1");
  return `/inbox?${params.toString()}`;
}

/** Hash da aba/página para o cliente não disparar refetch RSC do App Router. */
export function inboxClientHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  unread?: boolean;
}) {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) hash.set("page", String(input.page));
  if (input.cid) hash.set("cid", input.cid);
  if (input.unread) hash.set("unread", "1");
  return `${url.pathname}${url.search}#${hash.toString()}`;
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
  };
}
