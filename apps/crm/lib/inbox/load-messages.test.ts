import { describe, expect, it } from "vitest";
import { loadRecentConversationMessages } from "./load-messages";

describe("loadRecentConversationMessages", () => {
  it("preserves private audio fields when favorites cannot be read", async () => {
    const selections: string[] = [];
    const results = [
      {
        data: null,
        error: {
          code: "42501",
          message: "permission denied for table message_favorites",
        },
      },
      {
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
            media_url: null,
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
      },
    ];

    const query = {
      eq() { return this; },
      gte() { return this; },
      order() { return this; },
      limit() { return Promise.resolve(results.shift()); },
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
      media_storage_path: "audio/message-1.ogg",
      media_storage_status: "stored",
      is_favorite: false,
    });
    expect(selections).toHaveLength(2);
    expect(selections[0]).toContain("message_favorites(user_id)");
    expect(selections[1]).toContain("media_storage_path");
    expect(selections[1]).not.toContain("message_favorites");
  });
});
