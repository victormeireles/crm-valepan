"use client";

import {
  addInboxMessageToNotes,
  loadEarlierInboxMessages,
  reactToInboxMessage,
} from "@/app/actions/inbox";
import type { InboxMessageRow } from "@/lib/inbox/load-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioMessagePlayer } from "./audio-message-player";
import { DocumentInsightPanel } from "./document-insight-panel";
import { DocumentSearch } from "./document-search";
import { MediaPreviewDialog } from "./media-preview-dialog";

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

function isPlayableMediaSrc(value: string | null | undefined): value is string {
  if (!value) return false;
  const src = value.trim();
  return /^https?:\/\//i.test(src) || /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(src);
}

function renderMedia(message: InboxMessageRow) {
  if (!message.media_kind) return null;
  const privateMediaUrl =
    message.media_storage_path
      ? `/api/media/messages/${encodeURIComponent(message.id)}`
      : null;
  const mediaUrl =
    privateMediaUrl ??
    (isPlayableMediaSrc(message.media_url) ? message.media_url : null);
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
        <MediaPreviewDialog src={mediaUrl} fileName={fileName} kind="image" />
        <DocumentInsightPanel messageId={message.id} />
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
        <AudioMessagePlayer
          messageId={message.id}
          src={mediaUrl}
          mime={mime}
        />
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

  const isPdf =
    message.media_kind === "document" &&
    (mime?.split(";")[0]?.trim().toLowerCase() === "application/pdf" ||
      fileName.toLowerCase().endsWith(".pdf"));

  if (isPdf && mediaUrl) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-current/15 bg-black/5 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-700 text-[10px] font-bold text-white">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{fileName}</p>
          <MediaPreviewDialog src={mediaUrl} fileName={fileName} kind="pdf" />
          <DocumentInsightPanel messageId={message.id} />
        </div>
      </div>
    );
  }

  if (mediaUrl) {
    return (
      <div>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-semibold underline underline-offset-2"
        >
          Baixar {fileName}
        </a>
        {message.media_kind === "document" ? (
          <DocumentInsightPanel messageId={message.id} />
        ) : null}
      </div>
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

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

function messagePreview(message: InboxMessageRow) {
  return (
    message.body?.trim() ||
    message.media_file_name?.trim() ||
    (message.media_kind ? `Mensagem com ${message.media_kind}` : "Mensagem sem texto")
  );
}

function MessageActions({
  message,
  conversationId,
  onClose,
  onFeedback,
}: {
  message: InboxMessageRow;
  conversationId: string;
  onClose: () => void;
  onFeedback: (message: string, error?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function react(reaction: string) {
    if (busy) return;
    setBusy(true);
    const nextReaction = message.reaction === reaction ? null : reaction;
    const result = await reactToInboxMessage({
      conversationId,
      messageId: message.id,
      reaction: nextReaction,
    });
    setBusy(false);
    if (!result.ok) return onFeedback(result.error, true);
    onFeedback(nextReaction ? `Reação ${nextReaction} enviada.` : "Reação removida.");
    onClose();
  }

  return (
    <div
      className={`absolute top-full z-40 mt-2 w-[min(19rem,calc(100vw-2rem))] ${
        message.direction === "out" ? "right-0" : "left-0"
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1 shadow-[var(--sh-md)]">
        {QUICK_REACTIONS.map((reaction) => (
          <button
            key={reaction}
            type="button"
            disabled={busy || !message.provider_message_id}
            onClick={() => void react(reaction)}
            className={`flex size-9 items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 ${
              message.reaction === reaction ? "bg-[rgba(35,0,4,0.10)] ring-1 ring-[var(--vp-wine)]/30" : ""
            }`}
            aria-label={`Reagir com ${reaction}`}
          >
            {reaction}
          </button>
        ))}
      </div>
      <div role="menu" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1.5 shadow-[var(--sh-lg)]">
        <button
          type="button"
          role="menuitem"
          disabled={!message.provider_message_id}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("crm:reply-message", {
              detail: { conversationId, id: message.id, preview: messagePreview(message) },
            }));
            onClose();
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-40"
        >
          ↩ Responder
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(messagePreview(message));
              onFeedback("Mensagem copiada.");
              onClose();
            } catch {
              onFeedback("Não foi possível copiar a mensagem.", true);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5"
        >
          ⧉ Copiar
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await addInboxMessageToNotes({ conversationId, messageId: message.id });
            setBusy(false);
            if (!result.ok) return onFeedback(result.error, true);
            onFeedback("Mensagem adicionada às notas do lead.");
            onClose();
          }}
          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-40"
        >
          ＋ Adicionar às notas
        </button>
      </div>
    </div>
  );
}

function CallEventCard({ message }: { message: InboxMessageRow }) {
  const ringing = message.event_status === "ringing";
  const video = message.event_status === "missed_video";
  return (
    <div
      className={`mx-auto flex w-[min(92%,520px)] items-center gap-3 rounded-2xl border px-4 py-3 shadow-[var(--sh-sm)] ${
        ringing
          ? "animate-pulse border-[var(--vp-whatsapp)] bg-[rgba(37,211,102,0.12)]"
          : "border-[var(--vp-gold-classic)]/55 bg-[var(--vp-paper)]"
      }`}
      role={ringing ? "alert" : "status"}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-lg ${
          ringing ? "bg-[var(--vp-whatsapp)] text-white" : "bg-[rgba(35,0,4,0.09)]"
        }`}
        aria-hidden
      >
        {video ? "🎥" : "📞"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--foreground)]">
          {message.body ?? (ringing ? "Cliente está ligando agora" : "Ligação não atendida")}
        </p>
        <time className="text-xs text-[var(--muted)]" dateTime={message.sent_at}>
          {new Date(message.sent_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {ringing ? (
        <span className="shrink-0 rounded-full bg-[var(--vp-whatsapp)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          Ligando
        </span>
      ) : null}
    </div>
  );
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
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [olderMessages, setOlderMessages] = useState<InboxMessageRow[]>([]);
  const [liveMessages, setLiveMessages] = useState<InboxMessageRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(hasMoreOlderInitial);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  const messages = useMemo(
    () => mergeById(mergeById(olderMessages, initialMessages), liveMessages),
    [olderMessages, initialMessages, liveMessages],
  );

  useEffect(() => {
    setOlderMessages([]);
    setLiveMessages([]);
    setHasMoreOlder(hasMoreOlderInitial);
    setLoadError(null);
    setSelectedMessageId(null);
    setFeedback(null);
  }, [conversationId, hasMoreOlderInitial]);

  useEffect(() => {
    const normalizeRealtimeRow = (value: unknown): InboxMessageRow | null => {
      const row = value as Partial<InboxMessageRow> | null;
      if (!row?.id || !row.sent_at || (row.direction !== "in" && row.direction !== "out")) {
        return null;
      }
      return {
        id: row.id,
        provider_message_id: row.provider_message_id ?? null,
        reply_to_message_id: row.reply_to_message_id ?? null,
        reaction: row.reaction ?? null,
        direction: row.direction,
        body: row.body ?? null,
        event_kind: row.event_kind ?? null,
        event_status: row.event_status ?? null,
        provider_call_id: row.provider_call_id ?? null,
        media_kind: row.media_kind ?? null,
        media_url: row.media_url ?? null,
        media_mime_type: row.media_mime_type ?? null,
        media_file_name: row.media_file_name ?? null,
        media_storage_path: row.media_storage_path ?? null,
        media_size_bytes: row.media_size_bytes ?? null,
        media_storage_status: row.media_storage_status ?? null,
        message_status: row.message_status ?? null,
        read_at: row.read_at ?? null,
        sent_at: row.sent_at,
      };
    };

    const channel = supabase
      .channel(`crm-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "crm",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = normalizeRealtimeRow(payload.new);
          if (row) setLiveMessages((previous) => mergeById(previous, [row]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "crm",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = normalizeRealtimeRow(payload.new);
          if (row) setLiveMessages((previous) => mergeById(previous, [row]));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

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
      <DocumentSearch conversationId={conversationId} />
      {feedback ? (
        <div
          role={feedback.error ? "alert" : "status"}
          className={`mx-auto mb-1 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${
            feedback.error
              ? "bg-red-50 text-[var(--vp-error)]"
              : "bg-[rgba(35,0,4,0.08)] text-[var(--vp-wine)]"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}
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
          const repliedMessage = m.reply_to_message_id
            ? messages.find((candidate) => candidate.id === m.reply_to_message_id) ?? null
            : null;
          return (
            <div key={m.id} id={`message-${m.id}`} className="w-full space-y-3">
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
            {m.event_kind === "whatsapp_call" ? (
              <CallEventCard message={m} />
            ) : (
            <div
              className={`flex w-full ${out ? "justify-end" : "justify-start"}`}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label="Abrir ações da mensagem"
                aria-expanded={selectedMessageId === m.id}
                onClick={() => setSelectedMessageId((current) => current === m.id ? null : m.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMessageId((current) => current === m.id ? null : m.id);
                  }
                  if (event.key === "Escape") setSelectedMessageId(null);
                }}
                className={
                  out
                    ? `relative max-w-[min(88%,440px)] cursor-pointer rounded-2xl rounded-br-sm bg-[var(--vp-wine)] px-3 py-2 text-sm text-[var(--vp-gold)] shadow-[var(--sh-sm)]${isNewSinceRead && out ? " ring-2 ring-[var(--vp-gold)]/35" : ""}${selectedMessageId === m.id ? " ring-2 ring-[var(--vp-gold)]/60" : ""}`
                    : `relative max-w-[min(88%,440px)] cursor-pointer rounded-2xl rounded-bl-sm border bg-[var(--vp-paper-pure)] px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--sh-sm)]${isNewSinceRead && !out ? " border-[var(--vp-wine)]/45 ring-1 ring-[var(--vp-wine)]/25" : " border-[var(--border)]"}${selectedMessageId === m.id ? " ring-2 ring-[var(--vp-wine)]/35" : ""}`
                }
              >
                {repliedMessage ? (
                  <div className={`mb-2 rounded-lg border-l-4 px-2.5 py-2 text-xs ${out ? "border-[var(--vp-gold)] bg-black/15" : "border-[var(--vp-wine)] bg-black/5"}`}>
                    <p className="mb-0.5 font-semibold">Em resposta a</p>
                    <p className="line-clamp-2 opacity-80">{messagePreview(repliedMessage)}</p>
                  </div>
                ) : null}
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
                {m.reaction ? (
                  <span className={`absolute -bottom-3 ${out ? "left-2" : "right-2"} rounded-full border border-[var(--border)] bg-[var(--vp-paper-pure)] px-1.5 py-0.5 text-sm shadow-sm`}>
                    {m.reaction}
                  </span>
                ) : null}
                {selectedMessageId === m.id ? (
                  <MessageActions
                    message={m}
                    conversationId={conversationId}
                    onClose={() => setSelectedMessageId(null)}
                    onFeedback={(text, error = false) => setFeedback({ text, error })}
                  />
                ) : null}
              </div>
            </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
