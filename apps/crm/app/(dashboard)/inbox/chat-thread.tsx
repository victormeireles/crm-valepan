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

function parseContactCard(body: string | null | undefined) {
  const text = (body ?? "").trim();
  if (!text) return null;
  const mark =
    text.startsWith("[Contato enviado]") || text.startsWith("[Contato]")
      ? text
      : null;
  if (!mark) return null;

  const withoutPrefix = text.replace(/^\[(Contato enviado|Contato)\]\s*/i, "");
  const [nameRaw, phoneRaw] = withoutPrefix.split("·");
  const name = (nameRaw ?? "").trim();
  const phone = (phoneRaw ?? "").trim();
  if (!name && !phone) return null;
  return { name: name || "Contato", phone: phone || "—" };
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function renderMedia(message: InboxMessageRow) {
  if (!message.media_kind) return null;
  const mediaUrl = isHttpUrl(message.media_url) ? message.media_url : null;
  const fileName = message.media_file_name?.trim() || "arquivo";
  const mime = message.media_mime_type?.trim() || undefined;

  if (message.media_kind === "image" && mediaUrl) {
    return (
      <div className="space-y-2">
        {/* URLs externas do WhatsApp: <Image> exigiria domínios em next.config */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={fileName}
          className="max-h-[320px] w-full rounded-lg border border-[var(--border)] object-contain bg-black/5"
          loading="lazy"
        />
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-semibold underline underline-offset-2"
        >
          Abrir imagem
        </a>
      </div>
    );
  }

  if (message.media_kind === "video" && mediaUrl) {
    return (
      <div className="space-y-2">
        <video controls className="max-h-[320px] w-full rounded-lg border border-[var(--border)]">
          <source src={mediaUrl} type={mime} />
        </video>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-semibold underline underline-offset-2"
        >
          Abrir vídeo
        </a>
      </div>
    );
  }

  if (message.media_kind === "audio" && mediaUrl) {
    return (
      <div className="space-y-2">
        <audio controls className="w-full">
          <source src={mediaUrl} type={mime} />
        </audio>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-semibold underline underline-offset-2"
        >
          Abrir áudio
        </a>
      </div>
    );
  }

  if (mediaUrl) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex text-xs font-semibold underline underline-offset-2"
      >
        Baixar {fileName}
      </a>
    );
  }

  return (
    <p className="text-xs opacity-80">
      Mídia recebida, mas sem URL disponível no webhook para visualização.
    </p>
  );
}

function outboundStatusLabel(message: InboxMessageRow): string {
  return message.message_status === "read" ? "Lida" : "Enviada";
}

export function ChatThread({
  conversationId,
  initialMessages,
  hasMoreOlder: hasMoreOlderInitial,
  messagesLoadError,
  lastReadAtIso,
}: {
  conversationId: string;
  initialMessages: InboxMessageRow[];
  hasMoreOlder: boolean;
  messagesLoadError?: string;
  /** Mensagens com `sent_at` maior que este instante aparecem como novas desde a última leitura. */
  lastReadAtIso?: string | null;
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

  const firstNewSinceReadIdx = useMemo(() => {
    const lr = (lastReadAtIso ?? "").trim();
    if (!lr) return -1;
    return messages.findIndex((m) => m.sent_at > lr);
  }, [messages, lastReadAtIso]);

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
              className="rounded-xl border border-[color:var(--border-strong)] bg-[var(--vp-paper-pure)] px-4 py-2 text-xs font-semibold text-[var(--vp-wine)] shadow-sm transition-[transform,background-color,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--vp-wine)]/40 hover:bg-[rgba(35,0,4,0.05)] disabled:pointer-events-none disabled:opacity-50"
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

        {messages.map((m, idx) => {
          const out = m.direction === "out";
          const contactCard = parseContactCard(m.body);
          const isNewSinceRead =
            firstNewSinceReadIdx >= 0 &&
            idx >= firstNewSinceReadIdx &&
            (lastReadAtIso ?? "").trim().length > 0;
          return (
            <div key={m.id} className="w-full space-y-3">
              {idx === firstNewSinceReadIdx && firstNewSinceReadIdx >= 0 ? (
                <div
                  className="flex items-center gap-2 py-1"
                  role="separator"
                  aria-label="Novas mensagens desde a última leitura"
                >
                  <div className="h-px flex-1 bg-[var(--border)]" />
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--vp-wine)]">
                    Novas desde a última leitura
                  </span>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>
              ) : null}
            <div
              className={`flex w-full ${out ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  out
                    ? `max-w-[min(88%,440px)] rounded-2xl rounded-br-sm bg-[var(--vp-wine)] px-3 py-2 text-sm text-[var(--vp-gold)] shadow-[var(--sh-sm)]${isNewSinceRead && out ? " ring-2 ring-[var(--vp-gold)]/35" : ""}`
                    : `max-w-[min(88%,440px)] rounded-2xl rounded-bl-sm border bg-[var(--vp-paper-pure)] px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--sh-sm)]${isNewSinceRead && !out ? " border-[var(--vp-wine)]/45 ring-1 ring-[var(--vp-wine)]/25" : " border-[var(--border)]"}`
                }
              >
                {contactCard ? (
                  <div className="w-[min(100%,360px)] overflow-hidden rounded-xl border border-[rgba(80,20,24,0.22)] bg-[#f1dddd] text-[#3e1317]">
                    <div className="flex items-center gap-2 border-b border-[rgba(80,20,24,0.14)] px-3 py-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d7acac] text-xs font-semibold text-[#4a171c]">
                        {initials(contactCard.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{contactCard.name}</p>
                        <p className="truncate text-xs text-[#6b2a2f]">{contactCard.phone}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-[rgba(80,20,24,0.14)]">
                      <button
                        type="button"
                        className="px-2 py-2 text-xs font-medium text-[#6b2a2f] hover:bg-[rgba(80,20,24,0.08)]"
                      >
                        Conversar
                      </button>
                      <button
                        type="button"
                        className="px-2 py-2 text-xs font-medium text-[#6b2a2f] hover:bg-[rgba(80,20,24,0.08)]"
                      >
                        Adicionar a um grupo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {renderMedia(m)}
                    <p className="whitespace-pre-wrap break-words">
                      {m.body?.trim()
                        ? m.body
                        : "Sem texto neste registro (mensagem antiga ou mídia sem legenda)."}
                    </p>
                  </div>
                )}
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
                    {out ? outboundStatusLabel(m) : "Recebida"}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
