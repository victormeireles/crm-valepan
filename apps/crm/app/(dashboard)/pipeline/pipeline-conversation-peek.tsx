"use client";

import { loadInboxConversationView, type InboxConversationView } from "@/app/actions/inbox";
import { ContactAvatar } from "@/components/contact-avatar";
import { CrmIcon } from "@/components/crm-icon";
import {
  inboxConversationHref,
  type PipelineConversationPeekTarget,
} from "@/lib/pipeline-conversation-peek";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const PipelineConversationBody = dynamic(
  () => import("./pipeline-conversation-body").then((mod) => ({ default: mod.PipelineConversationBody })),
  { ssr: false, loading: () => <PeekThreadSkeleton /> },
);

function PeekThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando conversa</span>
      <div className="h-11 w-3/4 animate-pulse rounded-2xl bg-[var(--vp-surface)]" />
      <div className="ml-auto h-11 w-2/3 animate-pulse rounded-2xl bg-[var(--vp-surface-high)]" />
      <div className="h-16 w-4/5 animate-pulse rounded-2xl bg-[var(--vp-surface)]" />
      <div className="ml-auto h-11 w-1/2 animate-pulse rounded-2xl bg-[var(--vp-surface-high)]" />
    </div>
  );
}

export function PipelineConversationPeek({
  target,
  onClose,
}: {
  target: PipelineConversationPeekTarget | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [view, setView] = useState<InboxConversationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [target]);

  useEffect(() => {
    if (!target) {
      setView(null);
      setError(null);
      setLoading(false);
      return;
    }
    const conversationId = target.conversationId;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    setView(null);
    void loadInboxConversationView(conversationId)
      .then((result) => {
        if (version !== requestVersion.current) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setView(result.view);
      })
      .catch(() => {
        if (version !== requestVersion.current) return;
        setLoading(false);
        setError("Não foi possível abrir a conversa. Tente novamente.");
      });
  }, [target, reloadNonce]);

  const headerName = view?.conversation.headerName ?? target?.personName ?? "Cliente";
  const subtitle = view && target && view.conversation.id === target.conversationId
    ? [view.conversation.headerCompany, view.conversation.phone].filter(Boolean).join(" · ")
    : "Conversa do WhatsApp";
  const inboxHref = target ? inboxConversationHref(target.conversationId) : "/inbox";
  const visibleView = view && target && view.conversation.id === target.conversationId ? view : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pipeline-conversation-peek-title"
      className="fixed inset-0 z-50 m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-[var(--vp-ink-body)] open:flex open:justify-end backdrop:bg-[rgba(35,0,4,0.45)]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {target ? (
      <div
        className="flex h-full w-full flex-col bg-[var(--vp-paper-pure)] pt-[env(safe-area-inset-top)] shadow-[var(--sh-lg)] motion-safe:animate-[pipeline-peek-in_200ms_ease-out] md:w-[min(28.5rem,100vw)] md:rounded-l-2xl md:border-l md:border-[var(--vp-ink-line)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-4 py-3">
          <div className="flex items-start gap-3">
            <ContactAvatar
              name={headerName}
              src={view?.conversation.avatarUrl}
              phone={view?.conversation.phone}
              className="size-11 shrink-0"
              loading="eager"
              allowRefresh={false}
            />
            <div className="min-w-0 flex-1">
              <h2 id="pipeline-conversation-peek-title" className="truncate text-[15px] font-bold text-[var(--vp-ink-body)]">
                {headerName}
              </h2>
              <p className="mt-0.5 truncate text-xs text-[var(--vp-ink-muted)]">{subtitle}</p>
              <Link
                href={inboxHref}
                className="mt-1 inline-flex min-h-11 items-center text-xs font-bold text-[var(--vp-wine)] underline-offset-2 hover:underline md:min-h-0 md:py-0.5"
              >
                Abrir no Inbox
              </Link>
            </div>
            <button
              type="button"
              aria-label="Fechar conversa"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] text-[var(--vp-wine)]"
              onClick={onClose}
            >
              <CrmIcon name="close" className="text-lg" />
            </button>
          </div>
        </header>
        {error ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p role="alert" className="text-sm text-[var(--vp-error)]">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[var(--vp-wine)] px-4 text-sm font-bold text-[var(--vp-gold)]"
                onClick={() => setReloadNonce((value) => value + 1)}
              >
                Tentar novamente
              </button>
              <Link
                href={inboxHref}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--vp-ink-line)] px-4 text-sm font-bold text-[var(--vp-wine)]"
              >
                Abrir no Inbox
              </Link>
            </div>
          </div>
        ) : loading || !visibleView ? (
          <PeekThreadSkeleton />
        ) : (
          <PipelineConversationBody key={visibleView.conversation.id} view={visibleView} />
        )}
      </div>
      ) : null}
    </dialog>
  );
}
