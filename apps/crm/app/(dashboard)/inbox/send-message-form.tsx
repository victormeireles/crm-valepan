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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="phone" value={phone} />
      <textarea
        name="message"
        required
        placeholder="Digite a mensagem..."
        rows={3}
        className="min-h-[5.5rem] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted)] focus:border-[var(--vp-wine-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--vp-gold-deep)]/30"
      />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--vp-wine)] px-5 py-3.5 text-sm font-semibold text-[var(--vp-gold)] shadow-[var(--sh-md)] transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[var(--vp-wine-classic)] hover:shadow-[var(--sh-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vp-gold-deep)] disabled:pointer-events-none disabled:opacity-55"
      >
        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
          send
        </span>
        <span>{loading ? "Enviando…" : "Enviar mensagem"}</span>
      </button>
    </form>
  );
}
