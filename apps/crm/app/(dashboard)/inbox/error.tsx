"use client";

import { useEffect } from "react";

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[inbox] render error", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-[rgba(186,26,26,0.25)] bg-[var(--vp-paper-pure)] px-6 py-10 text-center shadow-[var(--sh-sm)]">
      <h2 className="text-lg font-bold text-[var(--vp-ink-body)]">Não foi possível atualizar o chat</h2>
      <p className="mt-2 text-sm text-[var(--vp-ink-muted)]">
        A tela continua disponível. Tente novamente sem precisar voltar pelo navegador.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-full bg-[var(--vp-wine)] px-5 py-2.5 text-sm font-bold text-[var(--vp-gold)]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
