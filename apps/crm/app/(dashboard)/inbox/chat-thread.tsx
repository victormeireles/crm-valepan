"use client";

import { loadEarlierInboxMessages } from "@/app/actions/inbox";
import type { InboxMessageRow } from "@/lib/inbox/load-messages";
import { useEffect, useMemo, useRef, useState } from "react";

export type ChatMessageRow = InboxMessageRow;

function mergeById(older: InboxMessageRow[], base: InboxMessageRow[]) {
  const map = new Map<string, InboxMessageRow>();
  for (const m of older) map.set(m.id, m);
  for (const m of base) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) =>
      a.sent_at.localeCompare(b.sent_at) || a.id.localeCompare(b.id),
  );
}

export function ChatThread({
  conversationId,
  initialMessages,
  hasMoreOlder: hasMoreOlderInitial,
  messagesLoadError,
}: {
  conversationId: string;
  initialMessages: InboxMessageRow[];
  hasMoreOlder: boolean;
  messagesLoadError?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipScrollToBottomRef = useRef(false);

  const [olderMessages, setOlderMessages] = useState<InboxMessageRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(hasMoreOlderInitial);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages = useMemo(
    () => mergeById(olderMessages, initialMessages),
    [olderMessages, initialMessages],
  );

  useEffect(() => {
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleLoadOlder() {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldest = messages[0];
    const prevScrollHeight = scrollRef.current?.scrollHeight ?? 0;

    setLoadingOlder(true);
    setLoadError(null);
    try {
      const res = await loadEarlierInboxMessages(
        conversationId,
        oldest.sent_at,
      );
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      skipScrollToBottomRef.current = true;
      setOlderMessages((prev) => mergeById(res.messages, prev));
      setHasMoreOlder(res.hasMoreOlder);

      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop += el.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  if (messagesLoadError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-2 py-6">
        <p className="text-center text-sm text-[var(--vp-error)]">
          Erro ao carregar mensagens: {messagesLoadError}
        </p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-2 py-8">
        <p className="text-sm text-[var(--muted)]">Sem mensagens nesta conversa.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 py-2"
      >
        {hasMoreOlder ? (
          <div className="flex justify-center pb-1 pt-0.5">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="rounded-full border border-[var(--border)] bg-[var(--vp-paper)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] shadow-sm hover:bg-[rgba(35,0,4,0.06)] disabled:opacity-50"
            >
              {loadingOlder
                ? "Carregando…"
                : "Carregar mensagens anteriores"}
            </button>
          </div>
        ) : null}

        {loadError ? (
          <p className="text-center text-xs text-[var(--vp-error)]">{loadError}</p>
        ) : null}

        {messages.map((m) => {
          const out = m.direction === "out";
          return (
            <div
              key={m.id}
              className={`flex w-full ${out ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  out
                    ? "max-w-[min(88%,440px)] rounded-2xl rounded-br-sm bg-[var(--vp-wine)] px-3 py-2 text-sm text-[var(--vp-gold)] shadow-[var(--sh-sm)]"
                    : "max-w-[min(88%,440px)] rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--sh-sm)]"
                }
              >
                <p className="whitespace-pre-wrap break-words">
                  {m.body?.trim()
                    ? m.body
                    : "Sem texto neste registro (mensagem antiga ou mídia sem legenda)."}
                </p>
                <div
                  className={`mt-1.5 flex items-center gap-1.5 text-[10px] leading-none ${
                    out
                      ? "justify-end text-[var(--vp-gold-pale)]/90"
                      : "justify-end text-[var(--muted)]"
                  }`}
                >
                  <span
                    className={`font-medium ${
                      out ? "text-[var(--vp-gold)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    {out ? "Enviada" : "Recebida"}
                  </span>
                  <span className="opacity-70">·</span>
                  <time dateTime={m.sent_at}>
                    {new Date(m.sent_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
