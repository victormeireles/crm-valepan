"use client";

import { markConversationRead } from "@/app/actions/inbox";
import { useEffect } from "react";

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
  useEffect(() => {
    if (!conversationId) return;
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

  return null;
}
