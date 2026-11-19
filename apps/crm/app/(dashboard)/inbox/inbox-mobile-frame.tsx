"use client";

import { useEffect, useState, type ReactNode } from "react";
import { INBOX_SELECT_CONVERSATION_EVENT } from "./inbox-conversation-pane";
import { INBOX_LOCATION_EVENT, readInboxLocation } from "./inbox-location";

/**
 * Abaixo de `md`, lista e conversa são telas separadas na mesma rota.
 * De `md` para cima o grid atual (pilha até 900px, colunas depois) não muda.
 */
export function InboxMobileFrame({
  initialConversationId,
  list,
  conversation,
}: {
  initialConversationId: string | null;
  list: ReactNode;
  conversation: ReactNode;
}) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);

  useEffect(() => {
    const syncFromLocation = () => {
      setConversationId(readInboxLocation().cid ?? null);
    };
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (id) setConversationId(id);
    };
    syncFromLocation();
    window.addEventListener(INBOX_SELECT_CONVERSATION_EVENT, onSelect);
    window.addEventListener(INBOX_LOCATION_EVENT, syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener(INBOX_SELECT_CONVERSATION_EVENT, onSelect);
      window.removeEventListener(INBOX_LOCATION_EVENT, syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (conversationId) root.dataset.inboxConversation = "open";
    else delete root.dataset.inboxConversation;
    return () => {
      delete root.dataset.inboxConversation;
    };
  }, [conversationId]);

  const open = Boolean(conversationId);

  return (
    <div
      data-inbox-frame
      className="flex min-h-0 flex-1 flex-col overflow-hidden md:grid grid-rows-[minmax(0,40vh)_minmax(0,1fr)] min-[900px]:grid-cols-[474px_minmax(0,1fr)] min-[900px]:grid-rows-[minmax(0,1fr)]"
    >
      <div
        data-inbox-panel
        className={`h-full min-h-0 flex-col overflow-hidden rounded-none border-r border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] ${
          open ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{list}</div>
      </div>
      <div
        className={
          open
            ? "max-md:fixed max-md:inset-0 max-md:z-40 max-md:flex max-md:h-dvh max-md:min-h-0 max-md:w-full max-md:flex-col max-md:overflow-hidden max-md:bg-[var(--vp-paper)] md:flex md:h-full md:min-h-0 md:min-w-0 md:flex-col md:overflow-hidden"
            : "hidden h-full min-h-0 min-w-0 flex-col overflow-hidden md:flex"
        }
      >
        {conversation}
      </div>
    </div>
  );
}
