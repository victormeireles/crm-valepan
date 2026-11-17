import { describe, expect, it } from "vitest";
import {
  inboxSidebarCacheKey,
  readInboxSidebarCache,
  writeInboxSidebarCache,
  invalidateInboxSidebarCache,
} from "./sidebar-list-cache";

describe("inboxSidebarCacheKey", () => {
  it("normaliza owner/unread/query", () => {
    expect(
      inboxSidebarCacheKey({
        tab: "leads",
        page: 1,
        unread: false,
        owner: null,
        query: null,
      }),
    ).toBe("leads|1|0|all|");
    expect(
      inboxSidebarCacheKey({
        tab: "leads",
        page: 2,
        unread: true,
        owner: "unassigned",
        query: "  Ana  ",
      }),
    ).toBe("leads|2|1|unassigned|Ana");
  });
});

describe("inbox sidebar list cache", () => {
  it("lê e expira via invalidate", () => {
    invalidateInboxSidebarCache();
    const key = inboxSidebarCacheKey({
      tab: "leads",
      page: 1,
      unread: false,
      owner: "unassigned",
    });
    writeInboxSidebarCache(key, {
      ok: true,
      conversations: [],
      tabCounts: { leads: 1, groups: 0, clientes: 0, arquivados: 0, perdidos: 0 },
      unreadCounts: { leads: 0, groups: 0, clientes: 0, arquivados: 0, perdidos: 0 },
      tabTotal: 1,
    });
    expect(readInboxSidebarCache(key)?.tabTotal).toBe(1);
    invalidateInboxSidebarCache();
    expect(readInboxSidebarCache(key)).toBeNull();
  });
});
