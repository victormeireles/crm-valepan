"use client";

import {
  listWhatsappContacts,
  sendConversationContactCard,
  sendConversationAttachment,
  sendConversationMessage,
} from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function IconSend({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function IconSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="48 80"
      />
    </svg>
  );
}

function IconAdd({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconMood({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </svg>
  );
}

export function SendMessageForm({
  conversationId,
  phone,
}: {
  conversationId: string;
  phone: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<{ phone: string; name: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQ, setContactQ] = useState("");
  const [sendingContactPhone, setSendingContactPhone] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onPointerDown(ev: MouseEvent) {
      if (!attachRef.current) return;
      const target = ev.target as Node | null;
      if (target && !attachRef.current.contains(target)) {
        setAttachOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("conversation_id", conversationId);
    fd.set("phone", phone);
    const res = await sendConversationMessage(fd);
    setLoading(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao enviar");
      return;
    }
    form.reset();
    router.refresh();
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
    const res = await sendConversationAttachment(fd);
    setUploadingAttachment(false);
    e.currentTarget.value = "";
    if (!res.ok) {
      setErr(res.error ?? "Erro ao enviar arquivo.");
      return;
    }
    router.refresh();
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
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => onPickAttachment(e, "media")}
      />

      <div className="flex items-end gap-2">
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
              <IconAdd className="size-[22px]" />
            </button>
            {attachOpen ? (
              <div
                role="menu"
                className="absolute bottom-12 left-0 z-20 min-w-[11rem] rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-1.5 shadow-[var(--sh-md)]"
              >
                {["Documento", "Fotos e vídeos", "Contato"].map((item) => (
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
                      if (item === "Fotos e vídeos") {
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
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--vp-ink-muted)] transition-colors hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-wine)]"
            title="Emoji (em breve)"
            aria-disabled="true"
          >
            <IconMood className="size-[22px]" />
          </button>
          <textarea
            name="message"
            required
            rows={1}
            placeholder="Mensagem"
            className="max-h-32 min-h-[42px] flex-1 resize-none border-0 bg-transparent py-2.5 pr-2 text-sm leading-snug text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-0"
          />
        </div>

        <button
          type="submit"
          disabled={loading || uploadingAttachment}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--vp-wine)] text-[var(--vp-gold)] shadow-[var(--sh-md)] transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--vp-wine-classic)] hover:shadow-[var(--sh-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vp-gold-deep)] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <IconSpinner className="size-[22px] animate-spin text-[var(--vp-gold)]" />
          ) : (
            <IconSend className="size-[22px] translate-x-px" />
          )}
          <span className="sr-only">{loading ? "A enviar…" : "Enviar mensagem"}</span>
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
                    router.refresh();
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
