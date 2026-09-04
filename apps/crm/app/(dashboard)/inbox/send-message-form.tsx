"use client";

import {
  listWhatsappContacts,
  sendConversationContactCard,
  sendConversationAttachment,
  sendConversationMessage,
} from "@/app/actions/inbox";
import { CrmIcon } from "@/components/crm-icon";
import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "./emoji-picker";
import { QUICK_REPLIES, renderQuickReply } from "@/lib/inbox/quick-replies";

export function SendMessageForm({
  conversationId,
  phone,
  firstName,
}: {
  conversationId: string;
  phone: string;
  firstName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<{ phone: string; name: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQ, setContactQ] = useState("");
  const [sendingContactPhone, setSendingContactPhone] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onPointerDown(ev: MouseEvent) {
      if (!attachRef.current) return;
      const target = ev.target as Node | null;
      if (target && !attachRef.current.contains(target)) {
        setAttachOpen(false);
      }
      if (target && emojiRef.current && !emojiRef.current.contains(target)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    function onReply(event: Event) {
      const detail = (event as CustomEvent<{ conversationId: string; id: string; preview: string }>).detail;
      if (!detail || detail.conversationId !== conversationId) return;
      setReplyTo({ id: detail.id, preview: detail.preview });
      requestAnimationFrame(() => messageRef.current?.focus());
    }
    window.addEventListener("crm:reply-message", onReply);
    return () => window.removeEventListener("crm:reply-message", onReply);
  }, [conversationId]);

  function insertEmoji(emoji: string) {
    const field = messageRef.current;
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.value = `${field.value.slice(0, start)}${emoji}${field.value.slice(end)}`;
    const nextCursor = start + emoji.length;
    field.focus();
    requestAnimationFrame(() => field.setSelectionRange(nextCursor, nextCursor));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("conversation_id", conversationId);
    fd.set("phone", phone);
    try {
      const res = await sendConversationMessage(fd);
      if (!res.ok) {
        setErr(res.error ?? "Erro ao enviar");
        return;
      }
      form.reset();
      setReplyTo(null);
    } catch (error) {
      console.error("[inbox] message send:", error);
      setErr("Não foi possível enviar a mensagem. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function onPickAttachment(
    e: React.ChangeEvent<HTMLInputElement>,
    mode: "document" | "media",
  ) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setErr(null);
    setUploadingAttachment(true);
    const fd = new FormData();
    fd.set("conversation_id", conversationId);
    fd.set("phone", phone);
    fd.set("attachment_mode", mode);
    fd.set("attachment", file);
    try {
      const res = await sendConversationAttachment(fd);
      if (!res.ok) {
        setErr(res.error ?? "Erro ao enviar arquivo.");
      }
    } catch (error) {
      console.error("[inbox] attachment upload:", error);
      setErr("Não foi possível enviar o arquivo. Tente novamente.");
    } finally {
      setUploadingAttachment(false);
      e.target.value = "";
    }
  }

  const filteredContacts = contacts.filter((c) => {
    const q = contactQ.trim().toLowerCase();
    if (!q) return true;
    return `${c.name ?? ""} ${c.phone}`.toLowerCase().includes(q);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="reply_to_message_id" value={replyTo?.id ?? ""} />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      {uploadingAttachment ? (
        <p className="text-xs text-[var(--muted)]">Enviando anexo...</p>
      ) : null}

      <input
        ref={documentInputRef}
        type="file"
        className="hidden"
        onChange={(e) => onPickAttachment(e, "document")}
      />
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => onPickAttachment(e, "media")}
      />

      {replyTo ? (
        <div className="flex items-center gap-3 rounded-xl border-l-4 border-[var(--vp-wine)] bg-[rgba(35,0,4,0.05)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--vp-wine)]">Respondendo à mensagem</p>
            <p className="truncate text-xs text-[var(--muted)]">{replyTo.preview}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="flex size-7 items-center justify-center rounded-full text-lg text-[var(--muted)] hover:bg-black/5"
            aria-label="Cancelar resposta"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">Respostas rápidas</span>
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply.title}
            type="button"
            className="min-h-9 shrink-0 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-semibold text-[var(--vp-wine)]"
            onClick={() => {
              if (!messageRef.current) return;
              messageRef.current.value = renderQuickReply(reply.body, firstName);
              messageRef.current.focus();
              messageRef.current.setSelectionRange(messageRef.current.value.length, messageRef.current.value.length);
            }}
          >
            {reply.title}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2.5">
        <div className="flex min-h-12 flex-1 items-end gap-0.5 rounded-[1.5rem] border border-[var(--border)] bg-[var(--vp-paper-pure)] px-1 py-1 shadow-[var(--sh-sm)]">
          <div ref={attachRef} className="relative">
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--vp-ink-muted)] transition-colors hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-wine)]"
              title="Anexos"
              aria-haspopup="menu"
              aria-expanded={attachOpen}
            >
              <CrmIcon name="add" className="text-[22px]" />
            </button>
            {attachOpen ? (
              <div
                role="menu"
                className="absolute bottom-12 left-0 z-20 min-w-[11rem] rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1.5 shadow-[var(--sh-md)]"
              >
                {["Documento", "Fotos, vídeos e áudios", "Contato"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={async () => {
                      setAttachOpen(false);
                      if (item === "Documento") {
                        setErr(null);
                        documentInputRef.current?.click();
                        return;
                      }
                      if (item === "Fotos, vídeos e áudios") {
                        setErr(null);
                        mediaInputRef.current?.click();
                        return;
                      }
                      setContactsLoading(true);
                      setErr(null);
                      const res = await listWhatsappContacts();
                      setContactsLoading(false);
                      if (!res.ok) {
                        setErr(res.error ?? "Erro ao carregar contatos.");
                        return;
                      }
                      setContacts(res.contacts);
                      setContactQ("");
                      setContactPickerOpen(true);
                    }}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[rgba(35,0,4,0.06)]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div ref={emojiRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setEmojiOpen((open) => !open);
                setAttachOpen(false);
              }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--vp-ink-muted)] transition-colors hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-wine)]"
              title="Emojis"
              aria-label="Abrir seletor de emojis"
              aria-haspopup="dialog"
              aria-expanded={emojiOpen}
            >
              <CrmIcon name="mood" className="text-[22px]" />
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-12 left-[-2.75rem] z-30" role="dialog" aria-label="Selecionar emoji">
                <EmojiPicker onSelect={insertEmoji} />
              </div>
            ) : null}
          </div>
          <textarea
            ref={messageRef}
            name="message"
            required
            rows={1}
            placeholder={`Escreva para ${firstName} — Enter envia, Shift+Enter quebra linha`}
            onChange={() => {
              if (err) setErr(null);
            }}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              if (loading || uploadingAttachment || !event.currentTarget.value.trim()) {
                return;
              }
              event.currentTarget.form?.requestSubmit();
            }}
            className="max-h-32 min-h-[42px] flex-1 resize-none border-0 bg-transparent py-2.5 pr-2 text-sm leading-snug text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-0"
          />
        </div>

        <button
          type="submit"
          disabled={loading || uploadingAttachment}
          className="inline-flex h-[50px] shrink-0 items-center gap-2 rounded-full bg-[var(--vp-wine)] px-5 text-sm font-bold text-[var(--vp-gold)] shadow-[var(--sh-md)] transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--vp-wine-classic)] hover:shadow-[var(--sh-lg)] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <CrmIcon name="progress_activity" className="animate-spin text-xl" />
          ) : (
            <CrmIcon name="send" className="text-xl" />
          )}
          <span>{loading ? "Enviando…" : "Enviar"}</span>
        </button>
      </div>
      {contactPickerOpen ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-3 shadow-[var(--sh-sm)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm text-[var(--foreground)]">Enviar contato</strong>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-[rgba(35,0,4,0.06)]"
              onClick={() => setContactPickerOpen(false)}
            >
              Fechar
            </button>
          </div>
          <input
            type="search"
            value={contactQ}
            onChange={(e) => setContactQ(e.target.value)}
            placeholder="Buscar contato..."
            className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
          />
          <div className="max-h-56 overflow-y-auto rounded border border-[var(--border)]">
            {contactsLoading ? (
              <p className="p-2 text-xs text-[var(--muted)]">Carregando contatos...</p>
            ) : filteredContacts.length === 0 ? (
              <p className="p-2 text-xs text-[var(--muted)]">Nenhum contato encontrado.</p>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={`${c.phone}-${c.name ?? ""}`}
                  type="button"
                  disabled={sendingContactPhone === c.phone}
                  onClick={async () => {
                    setSendingContactPhone(c.phone);
                    setErr(null);
                    const res = await sendConversationContactCard({
                      conversationId,
                      phone,
                      contactName: (c.name ?? c.phone).trim(),
                      contactPhone: c.phone,
                    });
                    setSendingContactPhone(null);
                    if (!res.ok) {
                      setErr(res.error ?? "Erro ao enviar contato.");
                      return;
                    }
                    setContactPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[rgba(35,0,4,0.05)] disabled:opacity-50"
                >
                  <span className="truncate text-[var(--foreground)]">{c.name ?? "Sem nome"}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{c.phone}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}
