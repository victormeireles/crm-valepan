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
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="phone" value={phone} />
      <textarea
        name="message"
        required
        placeholder="Digite a mensagem..."
        rows={3}
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
      />
      {err ? <p className="text-xs text-[var(--vp-error)]">{err}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--vp-gold)] disabled:opacity-50"
      >
        {loading ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  );
}
