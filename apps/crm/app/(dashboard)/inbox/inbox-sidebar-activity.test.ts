import { describe, expect, it } from "vitest";
import {
  conversationActivityChanged,
  moveConversationToFront,
  patchConversationInPlace,
} from "./inbox-sidebar-order";

describe("conversationActivityChanged", () => {
  const existing = {
    lastAt: "2026-11-13T12:00:00Z",
    preview: "Oi",
    lastDirection: "in" as string | null,
    callStatus: null as "ringing" | "missed_voice" | "missed_video" | null,
  };

  it("does not bump when only read state would change", () => {
    expect(
      conversationActivityChanged(existing, {
        lastMessageAt: existing.lastAt,
        lastBodyPreview: "Oi",
        lastDirection: "in",
        lastEventKind: null,
        lastEventStatus: null,
      }),
    ).toBe(false);
  });

  it("bumps when last message time changes", () => {
    expect(
      conversationActivityChanged(existing, {
        lastMessageAt: "2026-11-13T12:05:00Z",
        lastBodyPreview: "Oi",
        lastDirection: "in",
        lastEventKind: null,
        lastEventStatus: null,
      }),
    ).toBe(true);
  });

  it("bumps when preview text changes", () => {
    expect(
      conversationActivityChanged(existing, {
        lastMessageAt: existing.lastAt,
        lastBodyPreview: "Nova mensagem",
        lastDirection: "in",
        lastEventKind: null,
        lastEventStatus: null,
      }),
    ).toBe(true);
  });
});

describe("list order helpers", () => {
  it("patches in place without reordering", () => {
    const rows = [
      { id: "a", unread: true },
      { id: "b", unread: true },
      { id: "c", unread: true },
    ];
    expect(patchConversationInPlace(rows, { id: "b", unread: false })).toEqual([
      { id: "a", unread: true },
      { id: "b", unread: false },
      { id: "c", unread: true },
    ]);
  });

  it("moves to front only when explicitly requested", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveConversationToFront(rows, { id: "c" }, 20)).toEqual([
      { id: "c" },
      { id: "a" },
      { id: "b" },
    ]);
  });
});
