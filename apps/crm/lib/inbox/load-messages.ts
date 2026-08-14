import { agentDebugLog } from "@/lib/agent-debug-log";
import { crmTables } from "@/lib/supabase/server";
import { isLegacyZapiReactionBody } from "@/lib/zapi/webhook-event";



export type InboxMessageRow = {

  id: string;
  provider_message_id: string | null;
  reply_to_message_id: string | null;
  reaction: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  pinned_until: string | null;
  is_favorite: boolean;

  direction: "in" | "out";

  body: string | null;
  event_kind: "whatsapp_call" | null;
  event_status: "ringing" | "missed_voice" | "missed_video" | null;
  provider_call_id: string | null;

  media_kind: "image" | "video" | "audio" | "document" | null;

  media_url: string | null;

  media_mime_type: string | null;

  media_file_name: string | null;
  media_storage_path: string | null;
  media_size_bytes: number | null;
  media_storage_status: "stored" | "remote" | "failed" | "missing" | null;
  message_status: "sent" | "read" | null;
  read_at: string | null;

  sent_at: string;

};

const MESSAGES_SELECT_WITH_MEDIA =
  "id, provider_message_id, reply_to_message_id, reaction, edited_at, deleted_at, pinned_at, pinned_until, direction, body, event_kind, event_status, provider_call_id, media_kind, media_url, media_mime_type, media_file_name, media_storage_path, media_size_bytes, media_storage_status, message_status, read_at, sent_at, message_favorites(user_id)";
const MESSAGES_SELECT_WITH_LEGACY_MEDIA =
  "id, direction, body, media_kind, media_url, media_mime_type, media_file_name, message_status, read_at, sent_at";
const MESSAGES_SELECT_LEGACY = "id, direction, body, sent_at";

type LegacyMediaRow = Omit<
  InboxMessageRow,
  | "media_storage_path"
  | "media_size_bytes"
  | "media_storage_status"
  | "event_kind"
  | "event_status"
  | "provider_call_id"
  | "provider_message_id"
  | "reply_to_message_id"
  | "reaction"
  | "edited_at"
  | "deleted_at"
  | "pinned_at"
  | "pinned_until"
  | "is_favorite"
>;

function isMissingMediaColumnError(error?: { message?: string; code?: string } | null) {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("media_kind") ||
    msg.includes("media_url") ||
    msg.includes("media_mime_type") ||
    msg.includes("media_file_name") ||
    msg.includes("media_storage_path") ||
    msg.includes("media_size_bytes") ||
    msg.includes("media_storage_status") ||
    msg.includes("event_kind") ||
    msg.includes("event_status") ||
    msg.includes("provider_call_id") ||
    msg.includes("provider_message_id") ||
    msg.includes("reply_to_message_id") ||
    msg.includes("reaction")
    || msg.includes("edited_at")
    || msg.includes("deleted_at")
    || msg.includes("pinned_at")
    || msg.includes("pinned_until")
    || msg.includes("message_favorites")
  );
}

function normalizeLegacyRows(
  rows: Array<{ id: string; direction: "in" | "out"; body: string | null; sent_at: string }>,
): InboxMessageRow[] {
  return rows.map((row) => ({
    ...row,
    media_kind: null,
    event_kind: null,
    event_status: null,
    provider_call_id: null,
    provider_message_id: null,
    reply_to_message_id: null,
    reaction: null,
    edited_at: null,
    deleted_at: null,
    pinned_at: null,
    pinned_until: null,
    is_favorite: false,
    media_url: null,
    media_mime_type: null,
    media_file_name: null,
    media_storage_path: null,
    media_size_bytes: null,
    media_storage_status: null,
    message_status: null,
    read_at: null,
  }));
}

function normalizeLegacyMediaRows(rows: LegacyMediaRow[]): InboxMessageRow[] {
  return rows.map((row) => ({
    ...row,
    event_kind: null,
    event_status: null,
    provider_call_id: null,
    provider_message_id: null,
    reply_to_message_id: null,
    reaction: null,
    edited_at: null,
    deleted_at: null,
    pinned_at: null,
    pinned_until: null,
    is_favorite: false,
    media_storage_path: null,
    media_size_bytes: null,
    media_storage_status: row.media_url ? "remote" : null,
  }));
}


type CrmClient = ReturnType<typeof crmTables>;

function normalizeLoadedRows(rows: unknown[]): InboxMessageRow[] {
  return rows.map((value) => {
    const row = value as InboxMessageRow & { message_favorites?: unknown[] };
    return {
      ...row,
      is_favorite: Array.isArray(row.message_favorites) && row.message_favorites.length > 0,
    };
  });
}



/** Quantidade de mensagens por “página” (recentes ou bloco de mais antigas). */

export const INBOX_MESSAGE_PAGE_SIZE = 100;



/**

 * Carrega as mensagens mais recentes da conversa (para o Inbox).

 * Pedimos PAGE_SIZE+1 para saber se existem mensagens mais antigas fora desta janela.

 */

export async function loadRecentConversationMessages(

  crm: CrmClient,

  conversationId: string,

): Promise<{

  messages: InboxMessageRow[];

  hasMoreOlder: boolean;

  error?: { message: string; code?: string };

}> {

  const take = INBOX_MESSAGE_PAGE_SIZE + 1;

  let res = await crm
    .from("messages")
    .select(MESSAGES_SELECT_WITH_MEDIA)
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(take);

  if (res.error && isMissingMediaColumnError(res.error)) {
    let fallback = await crm
      .from("messages")
      .select(MESSAGES_SELECT_WITH_LEGACY_MEDIA)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(take);
    if (fallback.error && isMissingMediaColumnError(fallback.error)) {
      fallback = await crm
        .from("messages")
        .select(MESSAGES_SELECT_LEGACY)
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(take) as unknown as typeof fallback;
    }
    if (fallback.error) {
      res = fallback as unknown as typeof res;
    } else {
      const rows = fallback.data ?? [];
      const data =
        rows.length > 0 && "media_kind" in rows[0]
          ? normalizeLegacyMediaRows(rows as unknown as LegacyMediaRow[])
          : normalizeLegacyRows(rows as unknown as Array<{
              id: string;
              direction: "in" | "out";
              body: string | null;
              sent_at: string;
            }>);
      res = { ...fallback, data } as unknown as typeof res;
    }
  }

  // #region agent log
  agentDebugLog({
    location: "load-messages.ts:loadRecentConversationMessages",
    message: "inbox_messages_loaded",
    hypothesisId: "H6",
    data: {
      conversationIdPrefix: conversationId.slice(0, 8),
      returnedCount: (res.data ?? []).length,
      hasMoreOlderHint: (res.data ?? []).length > INBOX_MESSAGE_PAGE_SIZE,
      dbError: !!res.error,
      errorCode: res.error?.code ?? null,
    },
  });
  // #endregion

  if (res.error) {

    return { messages: [], hasMoreOlder: false, error: res.error };

  }



  const rows = normalizeLoadedRows(res.data ?? []);

  const hasMoreOlder = rows.length > INBOX_MESSAGE_PAGE_SIZE;

  const windowRows = (hasMoreOlder ? rows.slice(0, INBOX_MESSAGE_PAGE_SIZE) : rows).filter(
    (row) => !isLegacyZapiReactionBody(row.body),
  );

  windowRows.reverse();

  return { messages: windowRows, hasMoreOlder };

}



/**

 * Mensagens com `sent_at` estritamente anterior ao cursor (mensagem mais antiga visível).

 */

export async function loadOlderMessagesPage(

  crm: CrmClient,

  conversationId: string,

  beforeSentAt: string,

): Promise<{

  messages: InboxMessageRow[];

  error?: { message: string; code?: string };

}> {

  let res = await crm
    .from("messages")
    .select(MESSAGES_SELECT_WITH_MEDIA)
    .eq("conversation_id", conversationId)
    .lt("sent_at", beforeSentAt)
    .order("sent_at", { ascending: false })
    .limit(INBOX_MESSAGE_PAGE_SIZE);

  if (res.error && isMissingMediaColumnError(res.error)) {
    let fallback = await crm
      .from("messages")
      .select(MESSAGES_SELECT_WITH_LEGACY_MEDIA)
      .eq("conversation_id", conversationId)
      .lt("sent_at", beforeSentAt)
      .order("sent_at", { ascending: false })
      .limit(INBOX_MESSAGE_PAGE_SIZE);
    if (fallback.error && isMissingMediaColumnError(fallback.error)) {
      fallback = await crm
        .from("messages")
        .select(MESSAGES_SELECT_LEGACY)
        .eq("conversation_id", conversationId)
        .lt("sent_at", beforeSentAt)
        .order("sent_at", { ascending: false })
        .limit(INBOX_MESSAGE_PAGE_SIZE) as unknown as typeof fallback;
    }
    if (fallback.error) {
      res = fallback as unknown as typeof res;
    } else {
      const rows = fallback.data ?? [];
      const data =
        rows.length > 0 && "media_kind" in rows[0]
          ? normalizeLegacyMediaRows(rows as unknown as LegacyMediaRow[])
          : normalizeLegacyRows(rows as unknown as Array<{
              id: string;
              direction: "in" | "out";
              body: string | null;
              sent_at: string;
            }>);
      res = { ...fallback, data } as unknown as typeof res;
    }
  }



  if (res.error) {

    return { messages: [], error: res.error };

  }



  const rows = normalizeLoadedRows(res.data ?? [])
    .filter((row) => !isLegacyZapiReactionBody(row.body))
    .reverse();

  return { messages: rows };

}


