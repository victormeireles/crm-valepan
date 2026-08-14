import { createAdminSupabaseClient, crmTables } from "@/lib/supabase/admin";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findNamedBlock(value: unknown, names: Set<string>, depth = 0): JsonObject | null {
  const current = object(value);
  if (!current || depth > 7) return null;
  for (const [key, child] of Object.entries(current)) {
    if (names.has(key)) {
      const block = object(child);
      if (block) return block;
    }
  }
  for (const child of Object.values(current)) {
    const found = findNamedBlock(child, names, depth + 1);
    if (found) return found;
  }
  return null;
}

function targetMessageId(block: JsonObject): string | null {
  const key = object(block.key);
  return string(block.messageId) ?? string(block.id) ?? string(key?.id);
}

/** Sincroniza eventos técnicos do WhatsApp sem criar balões artificiais no Inbox. */
export async function syncZapiMessageEvent(body: unknown): Promise<
  | { handled: false }
  | { handled: true; kind: "reaction" | "deleted" | "pin"; matched: boolean }
> {
  const crm = crmTables(createAdminSupabaseClient());

  const reaction = findNamedBlock(body, new Set(["reaction", "reactionMessage"]));
  if (reaction) {
    const providerId = targetMessageId(reaction);
    if (!providerId) return { handled: true, kind: "reaction", matched: false };
    const emoji = string(reaction.text) ?? string(reaction.reaction);
    const { data } = await crm
      .from("messages")
      .update({ reaction: emoji })
      .eq("provider_message_id", providerId)
      .select("id");
    return { handled: true, kind: "reaction", matched: (data ?? []).length > 0 };
  }

  const protocol = findNamedBlock(body, new Set(["protocolMessage"]));
  if (protocol) {
    const protocolType = string(protocol.type)?.toLowerCase() ?? protocol.type;
    const isDelete = protocolType === 0 || protocolType === "0" || protocolType === "revoke";
    if (isDelete) {
      const providerId = targetMessageId(protocol);
      if (!providerId) return { handled: true, kind: "deleted", matched: false };
      const { data } = await crm
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), reaction: null })
        .eq("provider_message_id", providerId)
        .select("id");
      return { handled: true, kind: "deleted", matched: (data ?? []).length > 0 };
    }
  }

  const pin = findNamedBlock(body, new Set(["pinMessage"]));
  if (pin) {
    const providerId = targetMessageId(pin);
    if (!providerId) return { handled: true, kind: "pin", matched: false };
    const action = string(pin.messageAction) ?? string(pin.action) ?? string(pin.type);
    const pinned = action !== "unpin" && action !== "0";
    const now = new Date();
    const { data } = await crm
      .from("messages")
      .update({
        pinned_at: pinned ? now.toISOString() : null,
        pinned_until: pinned ? new Date(now.getTime() + 7 * 86_400_000).toISOString() : null,
      })
      .eq("provider_message_id", providerId)
      .select("id");
    return { handled: true, kind: "pin", matched: (data ?? []).length > 0 };
  }

  return { handled: false };
}
