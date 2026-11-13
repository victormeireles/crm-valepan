import { describe, expect, it } from "vitest";
import {
  formatUnreadBadge,
  inboxShareHref,
  inboxTabFromParam,
  inboxUnreadFromParam,
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
});
