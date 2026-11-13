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
  const generationRef = useRef(0);

  useEffect(() => {
    const onUnread = (event: Event) => {
      const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (id === conversationId) {
        suppressedRef.current = id;
        generationRef.current += 1;
      }
    };
    window.addEventListener("crm:conversation-unread", onUnread);
    return () => {
      window.removeEventListener("crm:conversation-unread", onUnread);
      generationRef.current += 1;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (suppressedRef.current === conversationId) return;
    const generation = ++generationRef.current;
    void markConversationRead(conversationId).then((res) => {
      if (
        generationRef.current === generation &&
        suppressedRef.current !== conversationId &&
        res.ok
      ) {
        window.dispatchEvent(
          new CustomEvent("crm:conversation-read", {
            detail: { conversationId },
          }),
        );
      }
    });
    return () => {
      generationRef.current += 1;
    };
  }, [conversationId, fingerprint]);

  useEffect(() => {
    if (suppressedRef.current && suppressedRef.current !== conversationId) {
      suppressedRef.current = null;
    }
  }, [conversationId]);

  return null;
}
