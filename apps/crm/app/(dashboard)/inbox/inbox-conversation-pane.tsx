"use client";

import { loadInboxConversationView, loadInboxLeadPanel, type InboxConversationView } from "@/app/actions/inbox";
import { ContactAvatar } from "@/components/contact-avatar";
import { CrmIcon } from "@/components/crm-icon";
import { getCustomerWaitSignal } from "@/lib/lead-signals";
import { recordInboxBrowserMetric } from "@/lib/inbox-browser-performance";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChatThread } from "./chat-thread";
import { ExcludeLeadButton, RestoreLeadButton } from "./exclude-lead-actions";
import { InboxLeadPanel, InboxLeadPanelDrawer } from "./inbox-lead-panel";
import { MarkConversationRead } from "./mark-conversation-read";
import { SendMessageForm } from "./send-message-form";

export const INBOX_SELECT_CONVERSATION_EVENT = "crm:inbox-select-conversation";

type SelectConversationDetail = { conversationId: string; href: string };

export function InboxConversationPane({ initialView }: { initialView: InboxConversationView | null }) {
  const [view, setView] = useState(initialView);
  const [panelLoading, setPanelLoading] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestVersion = useRef(0);

  const selectConversation = useCallback((conversationId: string, href?: string) => {
    const startedAt = performance.now();
    const version = ++requestVersion.current;
    setError(null);
    setPanelLoading(false);
    setMobilePanelOpen(false);
    if (href) window.history.pushState({ inboxConversationId: conversationId }, "", href);
    startTransition(async () => {
      const result = await loadInboxConversationView(conversationId);
      if (version !== requestVersion.current) return;
      recordInboxBrowserMetric("conversation", startedAt, {
        success: result.ok,
        changedUrl: Boolean(href),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView(result.view);
    });
  }, []);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<SelectConversationDetail>).detail;
      if (detail?.conversationId) selectConversation(detail.conversationId, detail.href);
    };
    const onPopState = () => {
      const conversationId = new URL(window.location.href).searchParams.get("cid");
      if (conversationId) selectConversation(conversationId);
    };
    window.addEventListener(INBOX_SELECT_CONVERSATION_EVENT, onSelect);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener(INBOX_SELECT_CONVERSATION_EVENT, onSelect);
      window.removeEventListener("popstate", onPopState);
    };
  }, [selectConversation]);

  const conversation = view?.conversation ?? null;
  const loadLeadPanel = async (openOnMobile = false) => {
    if (!conversation?.leadId) return;
    if (view?.leadPanel) {
      if (openOnMobile) setMobilePanelOpen(true);
      return;
    }
    const conversationId = conversation.id;
    const startedAt = performance.now();
    const version = requestVersion.current;
    setPanelLoading(true);
    setError(null);
    try {
      const result = await loadInboxLeadPanel(conversationId);
      if (version !== requestVersion.current) return;
      recordInboxBrowserMetric("lead_panel", startedAt, {
        success: result.ok,
        mobile: openOnMobile,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView((current) => current?.conversation.id === conversationId
        ? { ...current, leadPanel: result.panel }
        : current);
      if (openOnMobile && result.panel) setMobilePanelOpen(true);
    } catch {
      recordInboxBrowserMetric("lead_panel", startedAt, {
        success: false,
        mobile: openOnMobile,
      });
      if (version === requestVersion.current) {
        setError("Não foi possível carregar a ficha. Tente novamente.");
      }
    } finally {
      if (version === requestVersion.current) setPanelLoading(false);
    }
  };
  const wait = conversation ? getCustomerWaitSignal({
    lastDirection: conversation.lastDirection,
    lastSentAt: conversation.lastSentAt,
    nowMs: Date.now(),
  }) : null;

  return (
    <>
      <section aria-busy={isPending} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
        {isPending ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-[var(--vp-surface-high)]">
            <span className="block h-full w-1/2 animate-pulse bg-[var(--vp-gold-classic)]" />
          </div>
        ) : null}
        {error ? <p role="alert" className="m-3 rounded-lg bg-[var(--vp-error-container)] px-3 py-2 text-xs text-[var(--vp-error)]">{error}</p> : null}
        {conversation && view ? (
          <>
            <MarkConversationRead conversationId={conversation.id} fingerprint={`${conversation.lastSentAt ?? ""}|${conversation.lastDirection ?? ""}|${conversation.lastBodyPreview ?? ""}`} />
            <div className="shrink-0 border-b border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-[18px] py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ContactAvatar name={conversation.headerName} src={conversation.avatarUrl} phone={conversation.phone} className="size-11 shrink-0" loading="eager" />
                  <div className="min-w-0">
                    <h1 className="truncate text-[17px] font-bold text-[var(--vp-ink-body)]">{conversation.headerName}</h1>
                    <p className="truncate text-xs text-[var(--vp-ink-muted)]">{[conversation.headerCompany, conversation.phone, conversation.location].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conversation.lastDirection === "in" && wait ? <span className="hidden items-center gap-1.5 rounded-full bg-[rgba(186,26,26,0.1)] px-3 py-1.5 text-[11px] font-extrabold tracking-[0.04em] text-[var(--vp-error)] sm:inline-flex"><span className="size-[7px] rounded-full bg-[var(--vp-error)]" />{wait.label.replace("Cliente esperando ", "Esperando ")}</span> : null}
                  {conversation.leadId ? (
                    <button
                      type="button"
                      disabled={panelLoading}
                      onClick={() => void loadLeadPanel(true)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-wine)] disabled:opacity-60 xl:hidden"
                    >
                      <CrmIcon name="contact_page" className="text-base" />
                      {panelLoading ? "Carregando…" : "Ficha"}
                    </button>
                  ) : null}
                  {view.leadPanel ? <InboxLeadPanelDrawer key={conversation.id} {...view.leadPanel} hideTrigger open={mobilePanelOpen} onOpenChange={setMobilePanelOpen} /> : null}
                  <a href={`tel:${conversation.phone}`} className="grid size-[34px] place-items-center rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-wine)]" aria-label={`Ligar para ${conversation.headerName}`}><CrmIcon name="call" className="text-lg" /></a>
                  {conversation.leadExcluded && conversation.leadId ? <RestoreLeadButton leadId={conversation.leadId} /> : conversation.leadId ? <ExcludeLeadButton leadId={conversation.leadId} iconOnly /> : null}
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--vp-paper)] px-[18px]"><ChatThread key={conversation.id} conversationId={conversation.id} initialMessages={view.messages} hasMoreOlder={view.hasMoreOlder} messagesLoadError={view.messagesLoadError} lastReadAtIso={conversation.lastReadAt} /></div>
            <div className="shrink-0 border-t border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-[18px] pb-4 pt-3"><SendMessageForm key={conversation.id} conversationId={conversation.id} phone={conversation.phone} firstName={conversation.firstName} /></div>
          </>
        ) : <div className="flex flex-1 items-center justify-center px-4 py-12"><p className="text-center text-sm text-[var(--muted)]">Nenhuma conversa para mostrar.</p></div>}
      </section>
      {view?.leadPanel ? <div className="hidden min-h-0 xl:block"><InboxLeadPanel key={view.conversation.id} {...view.leadPanel} /></div> : <aside className="hidden min-h-0 flex-col items-center justify-center gap-3 rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-5 text-center text-xs text-[var(--vp-ink-muted)] xl:flex">
        <span>{conversation?.leadId ? "A ficha será carregada somente quando necessária." : "Esta conversa não possui uma ficha de lead."}</span>
        {conversation?.leadId ? <button type="button" disabled={panelLoading} onClick={() => void loadLeadPanel()} className="min-h-9 rounded-full bg-[var(--vp-wine)] px-4 font-bold text-[var(--vp-gold)] disabled:opacity-60">{panelLoading ? "Carregando ficha…" : "Carregar ficha"}</button> : null}
      </aside>}
    </>
  );
}
