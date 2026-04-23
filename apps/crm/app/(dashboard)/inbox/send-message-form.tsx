"use client";

import { sendConversationMessage } from "@/app/actions/inbox";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
            <IconAdd className="size-[22px]" />
          </button>
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
          disabled={loading}
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
    </form>
  );
}
