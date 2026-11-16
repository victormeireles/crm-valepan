import { describe, expect, it } from "vitest";
import {
  constrainInboxOwnerFilter,
  formatUnreadBadge,
  inboxClientHashOwnsNavigation,
  inboxOwnerFromParam,
  inboxOwnerRpcArgs,
  inboxServerSnapshotMatchesClient,
  inboxShareHref,
  inboxTabFromParam,
  inboxUnreadFromParam,
  mergeStickyUnreadConversations,
  readInboxLocation,
  resolveInboxOwnerFilterSelection,
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

  it("preserves Não lidas when picking an owner on the rail", () => {
    expect(
      resolveInboxOwnerFilterSelection({
        currentTab: "leads",
        currentOwner: null,
        nextTab: "leads",
        nextOwner: "11111111-1111-4111-8111-111111111111",
        unreadOnly: true,
      }),
    ).toEqual({
      reload: true,
      tab: "leads",
      owner: "11111111-1111-4111-8111-111111111111",
      unread: true,
    });
  });

  it("skips reload when the rail owner option is already selected", () => {
    expect(
      resolveInboxOwnerFilterSelection({
        currentTab: "leads",
        currentOwner: null,
        nextTab: "leads",
        nextOwner: null,
        unreadOnly: true,
      }),
    ).toEqual({ reload: false });
  });

  it("keeps Não lidas when switching rail tab via owner flyout", () => {
    expect(
      resolveInboxOwnerFilterSelection({
        currentTab: "leads",
        currentOwner: null,
        nextTab: "groups",
        nextOwner: null,
        unreadOnly: true,
      }),
    ).toEqual({
      reload: true,
      tab: "groups",
      owner: null,
      unread: true,
    });
  });

  it("parses owner filter", () => {
    expect(inboxOwnerFromParam(null)).toBeNull();
    expect(inboxOwnerFromParam("unassigned")).toBe("unassigned");
    expect(inboxOwnerFromParam("none")).toBe("unassigned");
    expect(inboxOwnerFromParam("not-a-uuid")).toBeNull();
    expect(inboxOwnerFromParam("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(inboxOwnerRpcArgs("unassigned")).toEqual({
      p_owner_user_id: null,
      p_unassigned: true,
    });
    expect(inboxOwnerRpcArgs("11111111-1111-4111-8111-111111111111")).toEqual({
      p_owner_user_id: "11111111-1111-4111-8111-111111111111",
      p_unassigned: false,
    });
    expect(
      constrainInboxOwnerFilter("22222222-2222-4222-8222-222222222222", {
        userId: "11111111-1111-4111-8111-111111111111",
        canViewTeam: false,
      }),
    ).toBeNull();
    expect(
      constrainInboxOwnerFilter("11111111-1111-4111-8111-111111111111", {
        userId: "11111111-1111-4111-8111-111111111111",
        canViewTeam: false,
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("treats a hash tab as a complete unread snapshot", () => {
    expect(readInboxLocation("https://crm.test/inbox?unread=1#tab=leads").unread).toBe(false);
    expect(
      readInboxLocation(
        "https://crm.test/inbox?owner=unassigned#tab=leads&owner=11111111-1111-4111-8111-111111111111",
      ).owner,
    ).toBe("11111111-1111-4111-8111-111111111111");
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
    expect(
      inboxServerSnapshotMatchesClient(
        { tab: "leads", page: 1, unread: false, owner: null },
        { tab: "leads", page: 1, unread: false, owner: "unassigned" },
      ),
    ).toBe(false);
  });

  it("includes unread in share href when set", () => {
    expect(inboxShareHref({ tab: "leads", page: 1, unread: true })).toBe(
      "/inbox?tab=leads&unread=1",
    );
    expect(inboxShareHref({ tab: "leads", page: 1 })).toBe("/inbox?tab=leads");
    expect(inboxShareHref({ tab: "leads", page: 1, owner: "unassigned" })).toBe(
      "/inbox?tab=leads&owner=unassigned",
    );
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
