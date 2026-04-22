import { agentDebugLog } from "@/lib/agent-debug-log";
import { crmTables } from "@/lib/supabase/server";



export type InboxMessageRow = {

  id: string;

  direction: "in" | "out";

  body: string | null;

  sent_at: string;

};



type CrmClient = ReturnType<typeof crmTables>;



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

  const res = await crm

    .from("messages")

    .select("id, direction, body, sent_at")

    .eq("conversation_id", conversationId)

    .order("sent_at", { ascending: false })

    .limit(take);

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



  const rows = (res.data ?? []) as InboxMessageRow[];

  const hasMoreOlder = rows.length > INBOX_MESSAGE_PAGE_SIZE;

  const windowRows = hasMoreOlder ? rows.slice(0, INBOX_MESSAGE_PAGE_SIZE) : rows;

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

  const res = await crm

    .from("messages")

    .select("id, direction, body, sent_at")

    .eq("conversation_id", conversationId)

    .lt("sent_at", beforeSentAt)

    .order("sent_at", { ascending: false })

    .limit(INBOX_MESSAGE_PAGE_SIZE);



  if (res.error) {

    return { messages: [], error: res.error };

  }



  const rows = ((res.data ?? []) as InboxMessageRow[]).reverse();

  return { messages: rows };

}


