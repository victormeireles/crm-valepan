import { describe, expect, it } from "vitest";
import {
  formatUnreadBadge,
  inboxClientHashOwnsNavigation,
  inboxServerSnapshotMatchesClient,
  inboxShareHref,
  inboxTabFromParam,
  inboxUnreadFromParam,
  mergeStickyUnreadConversations,
  readInboxLocation,
  resolveInboxTabTotal,
  sumInboxTabCounts,
} from "./inbox-location";

describe("inbox-location", () => {
  it("aliases novos/pipeline to leads and defaults to leads", () => {
    expect(inboxTabFromParam("novos")).toBe("leads");
    expect(inboxTabFromParam("pipeline")).toBe("leads");
    expect(inboxTabFromParam(null)).toBe("leads");
    expect(inboxTabFromParam("groups")).toBe("groups");
  });

  it("parses unread flag", () => {
    expect(inboxUnreadFromParam("1")).toBe(true);
    expect(inboxUnreadFromParam("true")).toBe(true);
    expect(inboxUnreadFromParam(null)).toBe(false);
  });

  it("treats a hash tab as a complete unread snapshot", () => {
    expect(readInboxLocation("https://crm.test/inbox?unread=1#tab=leads").unread).toBe(false);
  });

  it("detects client hash ownership of inbox navigation", () => {
    expect(inboxClientHashOwnsNavigation("https://crm.test/inbox?tab=leads")).toBe(false);
    expect(
      inboxClientHashOwnsNavigation("https://crm.test/inbox?tab=leads#tab=leads&page=3&unread=1"),
    ).toBe(true);
  });

  it("rejects RSC snapshots that do not match the client hash filter", () => {
    expect(
      inboxServerSnapshotMatchesClient(
        { tab: "leads", page: 1, unread: false },
        { tab: "leads", page: 3, unread: true },
      ),
    ).toBe(false);
    expect(
      inboxServerSnapshotMatchesClient(
        { tab: "leads", page: 3, unread: true },
        { tab: "leads", page: 3, unread: true },
      ),
    ).toBe(true);
  });

  it("includes unread in share href when set", () => {
    expect(inboxShareHref({ tab: "leads", page: 1, unread: true })).toBe(
      "/inbox?tab=leads&unread=1",
    );
    expect(inboxShareHref({ tab: "leads", page: 1 })).toBe("/inbox?tab=leads");
  });

  it("sums tab counts without novos", () => {
    expect(
      sumInboxTabCounts({ leads: 2, groups: 1, clientes: 3, perdidos: 4 }),
    ).toBe(10);
  });

  it("formats unread badge", () => {
    expect(formatUnreadBadge(0)).toBe("");
    expect(formatUnreadBadge(3)).toBe("3");
    expect(formatUnreadBadge(100)).toBe("99+");
  });

  it("trusts a zero RPC total when filtering unread conversations", () => {
    expect(
      resolveInboxTabTotal({
        unreadActive: true,
        tab: "leads",
        tabTotal: 0,
        tabCounts: { leads: 8, groups: 2, clientes: 3, perdidos: 1 },
      }),
    ).toBe(0);
  });

  it("falls back to tab counts outside the unread filter", () => {
    expect(
      resolveInboxTabTotal({
        unreadActive: false,
        tab: "all",
        tabTotal: 0,
        tabCounts: { leads: 8, groups: 2, clientes: 3, perdidos: 1 },
      }),
    ).toBe(14);
  });

  it("keeps sticky read rows when merging an unread-filtered refresh", () => {
    const previous = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const server = [{ id: "c" }];
    const readIds = new Set(["a", "b"]);
    expect(mergeStickyUnreadConversations(server, previous, readIds, true)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });

  it("does not keep sticky rows outside the unread filter", () => {
    const previous = [{ id: "a" }, { id: "b" }];
    const server = [{ id: "c" }];
    expect(mergeStickyUnreadConversations(server, previous, new Set(["a"]), false)).toBe(server);
  });

  it("appends new server unread rows after sticky previous order", () => {
    const previous = [{ id: "a" }, { id: "b" }];
    const server = [{ id: "b" }, { id: "d" }];
    const readIds = new Set(["a"]);
    expect(mergeStickyUnreadConversations(server, previous, readIds, true)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "d" },
    ]);
  });
});
