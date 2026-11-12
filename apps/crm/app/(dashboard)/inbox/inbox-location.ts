export type InboxTab = "novos" | "leads" | "groups" | "clientes" | "perdidos";

/** Escopo da lista: abas fixas + "all" só no modo busca. */
export type InboxSearchScope = InboxTab | "all";

export type InboxTabCounts = Record<InboxTab, number>;

export function inboxTabFromParam(value: string | null | undefined): InboxTab {
  if (
    value === "novos" ||
    value === "leads" ||
    value === "groups" ||
    value === "clientes" ||
    value === "perdidos"
  ) {
    return value;
  }
  if (value === "archived") return "clientes";
  if (value === "pipeline") return "leads";
  return "novos";
}

export function inboxSearchScopeFromParam(value: string | null | undefined): InboxSearchScope {
  if (value === "all") return "all";
  return inboxTabFromParam(value);
}

export function isInboxTab(value: string | null | undefined): value is InboxTab {
  return (
    value === "novos" ||
    value === "leads" ||
    value === "groups" ||
    value === "clientes" ||
    value === "perdidos"
  );
}

export function sumInboxTabCounts(counts: InboxTabCounts): number {
  return counts.novos + counts.leads + counts.groups + counts.clientes + counts.perdidos;
}

export function inboxShareHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  lookup?: boolean;
  q?: string | null;
}) {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) params.set("page", String(input.page));
  if (input.cid) params.set("cid", input.cid);
  if (input.lookup) params.set("lookup", "1");
  if (input.q?.trim()) params.set("q", input.q.trim());
  return `/inbox?${params.toString()}`;
}

/** Hash da aba/página para o cliente não disparar refetch RSC do App Router. */
export function inboxClientHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
}) {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) hash.set("page", String(input.page));
  if (input.cid) hash.set("cid", input.cid);
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
  return {
    tab: inboxSearchScopeFromParam(hash.get("tab") ?? url.searchParams.get("tab")),
    page: Math.max(1, Number.parseInt(hash.get("page") ?? url.searchParams.get("page") ?? "1", 10) || 1),
    cid: hash.get("cid") ?? url.searchParams.get("cid"),
  };
}
