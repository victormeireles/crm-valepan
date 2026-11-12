import { describe, expect, it } from "vitest";
import {
  loadRecentConversationMessages,
  slimInboxMediaUrl,
} from "./load-messages";

describe("slimInboxMediaUrl", () => {
  it("drops data URLs and prefers private storage over remote URLs", () => {
    expect(slimInboxMediaUrl("data:image/png;base64,aaaa", null)).toBeNull();
    expect(slimInboxMediaUrl("https://cdn.example/a.jpg", "audio/msg.ogg")).toBeNull();
    expect(slimInboxMediaUrl("https://cdn.example/a.jpg", null)).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(slimInboxMediaUrl(`https://x/${"a".repeat(3_000)}`, null)).toBeNull();
  });
});

describe("loadRecentConversationMessages", () => {
  it("loads private audio without embedding favorites or media_url", async () => {
    const selections: string[] = [];
    const query = {
      eq() { return this; },
      gte() { return this; },
      order() { return this; },
      limit() {
        return Promise.resolve({
          data: [
            {
              id: "message-1",
              provider_message_id: "provider-1",
              reply_to_message_id: null,
              reaction: null,
              edited_at: null,
              deleted_at: null,
              pinned_at: null,
              pinned_until: null,
              direction: "in",
              body: "[Áudio]",
              event_kind: null,
              event_status: null,
              provider_call_id: null,
              media_kind: "audio",
              media_mime_type: "audio/ogg; codecs=opus",
              media_file_name: "audio.ogg",
              media_storage_path: "audio/message-1.ogg",
              media_size_bytes: 54_958,
              media_storage_status: "stored",
              message_status: null,
              read_at: null,
              sent_at: "2026-09-24T17:44:03.000Z",
            },
          ],
          error: null,
        });
      },
    };
    const crm = {
      from() {
        return {
          select(selection: string) {
            selections.push(selection);
            return query;
          },
        };
      },
    };

    const result = await loadRecentConversationMessages(crm as never, "conversation-1");

    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      media_kind: "audio",
      media_url: null,
      media_storage_path: "audio/message-1.ogg",
      media_storage_status: "stored",
      is_favorite: false,
    });
    expect(selections).toHaveLength(1);
    expect(selections[0]).toContain("media_storage_path");
    expect(selections[0]).not.toContain("media_url");
    expect(selections[0]).not.toContain("message_favorites");
  });

  it("keeps media_kind when media_url is absent from the select", async () => {
    const crm = {
      from() {
        return {
          select() {
            return {
              eq() { return this; },
              gte() { return this; },
              order() { return this; },
              limit() {
                return Promise.resolve({
                  data: [
                    {
                      id: "message-2",
                      provider_message_id: "provider-2",
                      reply_to_message_id: null,
                      reaction: null,
                      edited_at: null,
                      deleted_at: null,
                      pinned_at: null,
                      pinned_until: null,
                      direction: "in",
                      body: "[Imagem]",
                      event_kind: null,
                      event_status: null,
                      provider_call_id: null,
                      media_kind: "image",
                      media_mime_type: "image/jpeg",
                      media_file_name: "foto.jpg",
                      media_storage_path: null,
                      media_size_bytes: 12_000,
                      media_storage_status: "remote",
                      message_status: null,
                      read_at: null,
                      sent_at: "2026-09-24T17:44:03.000Z",
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      },
    };

    const result = await loadRecentConversationMessages(crm as never, "conversation-2");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.media_url).toBeNull();
    expect(result.messages[0]?.media_kind).toBe("image");
  });
});
