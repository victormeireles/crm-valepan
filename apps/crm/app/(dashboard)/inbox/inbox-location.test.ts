import { describe, expect, it } from "vitest";
import {
  formatUnreadBadge,
  inboxShareHref,
  inboxTabFromParam,
  inboxUnreadFromParam,
  removeReadConversation,
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

  it("removes a read conversation only from an unread-filtered list", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(removeReadConversation(rows, "a", true)).toEqual([{ id: "b" }]);
    expect(removeReadConversation(rows, "a", false)).toBe(rows);
  });
});
