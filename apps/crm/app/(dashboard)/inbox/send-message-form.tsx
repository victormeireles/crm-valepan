"use client";

import { sendConversationMessage } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="phone" value={phone} />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}

      <div className="flex items-end gap-2">
        <div className="flex min-h-12 flex-1 items-end gap-0.5 rounded-[1.5rem] border border-[var(--border)] bg-[var(--vp-paper-pure)] px-1 py-1 shadow-[var(--sh-sm)]">
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--vp-ink-muted)] transition-colors hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-wine)]"
            title="Anexos (em breve)"
            aria-disabled="true"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              add
            </span>
          </button>
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--vp-ink-muted)] transition-colors hover:bg-[rgba(35,0,4,0.06)] hover:text-[var(--vp-wine)]"
            title="Emoji (em breve)"
            aria-disabled="true"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              sentiment_satisfied
            </span>
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
          disabled={loading}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--vp-wine)] text-[var(--vp-gold)] shadow-[var(--sh-md)] transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--vp-wine-classic)] hover:shadow-[var(--sh-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vp-gold-deep)] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <span
              className="material-symbols-outlined animate-spin text-[22px] leading-none"
              aria-hidden
            >
              progress_activity
            </span>
          ) : (
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
              send
            </span>
          )}
          <span className="sr-only">{loading ? "A enviar…" : "Enviar mensagem"}</span>
        </button>
      </div>
    </form>
  );
}
