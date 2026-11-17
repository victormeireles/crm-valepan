import type { InboxOwnerFilter, InboxSearchScope } from "@/app/(dashboard)/inbox/inbox-location";
import type { refreshInboxSidebar } from "@/app/actions/inbox";

type InboxSidebarRefreshSuccess = Extract<
  Awaited<ReturnType<typeof refreshInboxSidebar>>,
  { ok: true }
>;

/** Snapshot cacheável: métricas de servidor são opcionais (hidratação RSC). */
export type InboxSidebarRefreshOk = Omit<InboxSidebarRefreshSuccess, "serverMs" | "operationMs"> & {
  serverMs?: number;
  operationMs?: Record<string, number>;
};

type CacheEntry = {
  at: number;
  result: InboxSidebarRefreshOk;
};

const LIST_TTL_MS = 45_000;
const OWNER_COUNTS_TTL_MS = 30_000;

const listCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<InboxSidebarRefreshOk | null>>();
const ownerCountsCache = new Map<string, { at: number; rows: unknown }>();

export function inboxSidebarCacheKey(input: {
  tab: InboxSearchScope;
  page: number;
  query?: string | null;
  unread?: boolean;
  owner?: InboxOwnerFilter;
}): string {
  const query = (input.query ?? "").trim();
  const owner =
    input.owner === "unassigned"
      ? "unassigned"
      : typeof input.owner === "string" && input.owner
        ? input.owner
        : "all";
  return [
    input.tab,
    Math.max(1, Math.floor(input.page) || 1),
    input.unread ? "1" : "0",
    owner,
    query,
  ].join("|");
}

export function readInboxSidebarCache(key: string): InboxSidebarRefreshOk | null {
  const entry = listCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > LIST_TTL_MS) {
    listCache.delete(key);
    return null;
  }
  return entry.result;
}

export function writeInboxSidebarCache(key: string, result: InboxSidebarRefreshOk) {
  listCache.set(key, { at: Date.now(), result });
  // Evita crescer sem limite ao navegar páginas/filtros.
  if (listCache.size > 80) {
    const oldest = listCache.keys().next().value;
    if (oldest) listCache.delete(oldest);
  }
}

export function invalidateInboxSidebarCache() {
  listCache.clear();
  inflight.clear();
}

export async function fetchInboxSidebarCached(
  input: {
    tab: InboxSearchScope;
    page: number;
    query?: string | null;
    unread?: boolean;
    owner?: InboxOwnerFilter;
  },
  loader: (input: {
    tab: InboxSearchScope;
    page: number;
    query?: string | null;
    unread?: boolean;
    owner?: InboxOwnerFilter;
  }) => Promise<Awaited<ReturnType<typeof refreshInboxSidebar>>>,
  options?: { force?: boolean },
): Promise<InboxSidebarRefreshOk | null> {
  const key = inboxSidebarCacheKey(input);
  if (!options?.force) {
    const cached = readInboxSidebarCache(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const request = loader(input)
    .then((result) => {
      if (!result.ok) return null;
      writeInboxSidebarCache(key, result);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function readOwnerCountsCache<T>(tab: InboxSearchScope): T | null {
  const entry = ownerCountsCache.get(tab);
  if (!entry) return null;
  if (Date.now() - entry.at > OWNER_COUNTS_TTL_MS) {
    ownerCountsCache.delete(tab);
    return null;
  }
  return entry.rows as T;
}

export function writeOwnerCountsCache(tab: InboxSearchScope, rows: unknown) {
  ownerCountsCache.set(tab, { at: Date.now(), rows });
}
