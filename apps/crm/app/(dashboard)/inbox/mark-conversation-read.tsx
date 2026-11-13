"use client";

import { markConversationRead } from "@/app/actions/inbox";
import { useEffect, useRef } from "react";

/**
 * Marca a conversa como lida quando está em foco no inbox e atualiza quando chegam mensagens novas.
 */
export function MarkConversationRead({
  conversationId,
  fingerprint,
}: {
  conversationId: string | null;
  /** Ex.: último `last_sent_at` da conversa — quando muda, registra nova leitura. */
  fingerprint: string;
}) {
  const suppressedRef = useRef<string | null>(null);

  useEffect(() => {
    const onUnread = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (id) suppressedRef.current = id;
    };
    window.addEventListener("crm:conversation-unread", onUnread);
    return () => window.removeEventListener("crm:conversation-unread", onUnread);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    if (suppressedRef.current === conversationId) return;
    let cancelled = false;
    void markConversationRead(conversationId).then((res) => {
      if (!cancelled && res.ok) {
        window.dispatchEvent(
          new CustomEvent("crm:conversation-read", {
            detail: { conversationId },
          }),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, fingerprint]);

  useEffect(() => {
    if (suppressedRef.current && suppressedRef.current !== conversationId) {
      suppressedRef.current = null;
    }
  }, [conversationId]);

  return null;
}
