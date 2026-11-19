"use client";

import { loadInboxConversationView, loadInboxLeadPanel, type InboxConversationView } from "@/app/actions/inbox";
import { ContactAvatar } from "@/components/contact-avatar";
import { MobileSheet } from "@/components/mobile-sheet";
import { CrmIcon } from "@/components/crm-icon";
import { getCustomerWaitSignal } from "@/lib/lead-signals";
import { recordInboxBrowserMetric } from "@/lib/inbox-browser-performance";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChatThread } from "./chat-thread";
import { DocumentSearch } from "./document-search";
import { formatFunnelValue, InboxStageSheet } from "./inbox-stage-sheet";
import { ConversationPipelineSelect } from "./conversation-classification-select";
import { ExcludeLeadButton, RestoreLeadButton } from "./exclude-lead-actions";
import { ForwardDistributorByCepButton } from "./forward-distributor-by-cep";
import { closeInboxConversation, pushInboxClientUrl, readInboxLocation } from "./inbox-location";
import { InboxLeadPanelDrawer } from "./inbox-lead-panel";
import { MarkConversationRead } from "./mark-conversation-read";
import { SendMessageForm } from "./send-message-form";
import type { DistributorOption } from "@/lib/distributors";
import type { PipelineSubstageDTO } from "@/lib/pipeline-substages";

export const INBOX_SELECT_CONVERSATION_EVENT = "crm:inbox-select-conversation";

export type InboxConversationPreview = {
  name: string;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
};

type SelectConversationDetail = {
  conversationId: string;
  href: string;
  preview?: InboxConversationPreview | null;
};
type CatalogStage = { id: string; name: string; sortOrder: number; isFinal?: boolean };

function InboxMobileBackButton() {
  return (
    <button
      type="button"
      onClick={closeInboxConversation}
      aria-label="Voltar para a lista"
      className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--vp-wine)] md:hidden"
    >
      <CrmIcon name="chevron_left" className="text-[26px]" />
    </button>
  );
}

function ConversationLoadingSkeleton({
  preview,
}: {
  preview?: InboxConversationPreview | null;
}) {
  const bubbles = [
    { side: "in" as const, width: "w-[58%]" },
    { side: "out" as const, width: "w-[46%]" },
    { side: "in" as const, width: "w-[64%]" },
    { side: "out" as const, width: "w-[52%]" },
    { side: "in" as const, width: "w-[40%]" },
    { side: "out" as const, width: "w-[57%]" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-hidden={false}>
      <div className="shrink-0 border-b border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-[18px] py-3.5">
        <div className="flex items-center gap-3">
          <InboxMobileBackButton />
          {preview?.name ? (
            <ContactAvatar
              name={preview.name}
              src={preview.avatarUrl}
              phone={preview.phone}
              className="size-11 shrink-0"
              loading="eager"
              allowRefresh={false}
            />
          ) : (
            <span className="size-11 shrink-0 motion-safe:animate-pulse rounded-full bg-[var(--vp-surface-high)]" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            {preview?.name ? (
              <>
                <h1 className="truncate text-[17px] font-bold text-[var(--vp-ink-body)]">{preview.name}</h1>
                <p className="truncate text-xs text-[var(--vp-ink-muted)]">
                  {[preview.company, preview.phone].filter(Boolean).join(" · ") || "Carregando conversa…"}
                </p>
              </>
            ) : (
              <>
                <span className="block h-4 w-40 motion-safe:animate-pulse rounded bg-[var(--vp-surface-high)]" />
                <span className="block h-3 w-56 motion-safe:animate-pulse rounded bg-[var(--vp-surface)]" />
              </>
            )}
          </div>
        </div>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[var(--vp-paper)] px-[18px] py-4"
      >
        <span className="sr-only">Carregando conversa…</span>
        <div className="flex items-center justify-center gap-2 pb-1">
          <span className="size-1.5 rounded-full bg-[var(--vp-wine)] motion-safe:animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--vp-ink-muted)]">
            Carregando mensagens
          </span>
        </div>
        {bubbles.map((bubble, index) => (
          <div
            key={`inbox-load-bubble-${index}`}
            className={`flex ${bubble.side === "out" ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`h-14 ${bubble.width} motion-safe:animate-pulse rounded-2xl ${
                bubble.side === "out"
                  ? "rounded-br-[4px] bg-[rgba(35,0,4,0.14)]"
                  : "rounded-bl-[4px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)]"
              }`}
              style={{ animationDelay: `${index * 40}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-[18px] pb-4 pt-3">
        <span className="block h-12 w-full motion-safe:animate-pulse rounded-xl bg-[var(--vp-surface)]" />
      </div>
    </div>
  );
}

export function InboxConversationPane({
  initialView,
  stages,
  substages,
  distributors,
}: {
  initialView: InboxConversationView | null;
  stages: CatalogStage[];
  substages: PipelineSubstageDTO[];
  distributors: DistributorOption[];
}) {
  const [view, setView] = useState(initialView);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pendingPreview, setPendingPreview] = useState<InboxConversationPreview | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const selectConversation = useCallback((
    conversationId: string,
    href?: string,
    preview?: InboxConversationPreview | null,
  ) => {
    const startedAt = performance.now();
    const version = ++requestVersion.current;
    setError(null);
    setPanelLoading(false);
    setPanelOpen(false);
    setMoreOpen(false);
    setStageOpen(false);
    setPendingPreview(preview ?? null);
    setLoadingConversationId(conversationId);
    setView((current) =>
      current
        ? { ...current, leadPanel: null }
        : current,
    );
    if (href) pushInboxClientUrl({ inboxConversationId: conversationId }, href);
    startTransition(async () => {
      try {
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
      } catch {
        if (version !== requestVersion.current) return;
        recordInboxBrowserMetric("conversation", startedAt, {
          success: false,
          changedUrl: Boolean(href),
        });
        setError("Não foi possível carregar a conversa. Tente novamente.");
      } finally {
        if (version === requestVersion.current) {
          setLoadingConversationId(null);
          setPendingPreview(null);
        }
      }
    });
  }, []);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<SelectConversationDetail>).detail;
      if (detail?.conversationId) {
        selectConversation(detail.conversationId, detail.href, detail.preview);
      }
    };
    const onPopState = () => {
      const conversationId = readInboxLocation().cid;
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
  const [distributorId, setDistributorId] = useState(conversation?.distributorId ?? "");
  const saveDistributor = useCallback((next: string | null) => {
    setDistributorId(next ?? "");
  }, []);
  useEffect(() => {
    setDistributorId(conversation?.distributorId ?? "");
  }, [conversation?.id, conversation?.distributorId]);
  const openLeadPanel = async () => {
    if (!conversation?.leadId) return;
    if (view?.leadPanel) {
      setPanelOpen(true);
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
        drawer: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView((current) => current?.conversation.id === conversationId
        ? { ...current, leadPanel: result.panel }
        : current);
      if (result.panel) setPanelOpen(true);
    } catch {
      recordInboxBrowserMetric("lead_panel", startedAt, {
        success: false,
        drawer: true,
      });
      if (version === requestVersion.current) {
        setError("Não foi possível carregar a ficha. Tente novamente.");
      }
    } finally {
      if (version === requestVersion.current) setPanelLoading(false);
    }
  };
  const wait = conversation && nowMs != null
    ? getCustomerWaitSignal({
        lastDirection: conversation.lastDirection,
        lastSentAt: conversation.lastSentAt,
        nowMs,
      })
    : null;
  const showLoading = loadingConversationId != null;

  return (
      <section
        data-inbox-panel
        aria-busy={showLoading}
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-none border-r border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)]"
      >
        {showLoading ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-[var(--vp-surface-high)]">
            <span className="block h-full w-1/2 motion-safe:animate-pulse bg-[var(--vp-gold-classic)]" />
          </div>
        ) : null}
        {error ? <p role="alert" className="m-3 rounded-lg bg-[var(--vp-error-container)] px-3 py-2 text-xs text-[var(--vp-error)]">{error}</p> : null}
        {showLoading ? (
          <ConversationLoadingSkeleton preview={pendingPreview} />
        ) : conversation && view ? (
          <>
            <MarkConversationRead conversationId={conversation.id} fingerprint={`${conversation.lastSentAt ?? ""}|${conversation.lastDirection ?? ""}|${conversation.lastBodyPreview ?? ""}`} />
            <div className="shrink-0 border-b border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] md:px-[18px] md:py-3.5">
              <div className="flex items-center gap-1.5 bg-[var(--vp-paper-pure)] px-0.5 pb-2 pt-0.5 md:hidden">
                <InboxMobileBackButton />
                <ContactAvatar name={conversation.headerName} src={conversation.avatarUrl} phone={conversation.phone} className="size-10 shrink-0" loading="eager" allowRefresh={false} />
                <div className="min-w-0 flex-1 pl-1">
                  <h1 className="truncate text-base font-extrabold text-[var(--vp-ink-body)]">{conversation.headerName}</h1>
                  <p className="truncate text-xs text-[var(--vp-ink-muted)]">{[conversation.leadId ? "Empresa" : "Grupo", conversation.location].filter(Boolean).join(" · ")}</p>
                </div>
                <a href={`tel:${conversation.phone}`} className="grid size-11 place-items-center text-[var(--vp-wine)]" aria-label={`Ligar para ${conversation.headerName}`}><CrmIcon name="call" className="text-[21px]" /></a>
                <button type="button" onClick={() => setMoreOpen(true)} aria-label="Mais ações da conversa" className="grid size-11 place-items-center text-[var(--vp-wine)]"><CrmIcon name="more_horiz" className="text-[22px]" /></button>
              </div>
              <div className="hidden items-center justify-between gap-4 md:flex">
                <div className="flex min-w-0 items-center gap-3">
                  <ContactAvatar name={conversation.headerName} src={conversation.avatarUrl} phone={conversation.phone} className="size-11 shrink-0" loading="eager" allowRefresh={false} />
                  <div className="min-w-0">
                    <h1 className="truncate text-[17px] font-bold text-[var(--vp-ink-body)]">{conversation.headerName}</h1>
                    <p className="truncate text-xs text-[var(--vp-ink-muted)]">{[conversation.headerCompany, conversation.phone, conversation.location].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conversation.lastDirection === "in" && wait ? <span className="hidden items-center gap-1.5 rounded-full bg-[rgba(186,26,26,0.1)] px-3 py-1.5 text-[11px] font-extrabold tracking-[0.04em] text-[var(--vp-error)] sm:inline-flex"><span className="size-[7px] rounded-full bg-[var(--vp-error)]" />{wait.label.replace("Cliente esperando ", "Esperando ")}</span> : null}
                  <a href={`tel:${conversation.phone}`} className="grid size-[34px] place-items-center rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-wine)]" aria-label={`Ligar para ${conversation.headerName}`}><CrmIcon name="call" className="text-lg" /></a>
                  {conversation.leadId ? (
                    <ForwardDistributorByCepButton
                      conversationId={conversation.id}
                      leadId={conversation.leadId}
                      initialZipCode={conversation.zipCode}
                      onAssigned={(next) => {
                        setDistributorId(next.distributorId);
                        setView((current) =>
                          current
                            ? {
                                ...current,
                                conversation: {
                                  ...current.conversation,
                                  stageId: next.stageId,
                                  substage: next.substage,
                                  distributorId: next.distributorId,
                                  distributorName: next.distributorName,
                                  zipCode: next.zipCode,
                                },
                              }
                            : current,
                        );
                      }}
                    />
                  ) : null}
                  {conversation.leadId ? (
                    <ConversationPipelineSelect
                      conversationId={conversation.id}
                      leadId={conversation.leadId}
                      stages={stages}
                      substages={substages}
                      distributors={distributors}
                      stageId={conversation.stageId}
                      substage={conversation.substage}
                      distributorId={distributorId || null}
                      distributorName={conversation.distributorName}
                      onDistributorSaved={saveDistributor}
                      onSaved={(next) => {
                        setView((current) =>
                          current
                            ? {
                                ...current,
                                conversation: {
                                  ...current.conversation,
                                  stageId: next.stageId,
                                  substage: next.substage,
                                },
                              }
                            : current,
                        );
                      }}
                    />
                  ) : null}
                  {conversation.leadId ? (
                    <button
                      type="button"
                      disabled={panelLoading}
                      onClick={() => void openLeadPanel()}
                      aria-expanded={panelOpen}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-wine)] transition-[border-color,background-color] duration-200 hover:border-[var(--vp-gold-classic)] hover:bg-[var(--vp-gold-cream)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CrmIcon name="contact_page" className="text-base" />
                      {panelLoading ? "Carregando…" : "Ficha"}
                    </button>
                  ) : null}
                  {conversation.leadExcluded && conversation.leadId ? <RestoreLeadButton leadId={conversation.leadId} /> : conversation.leadId ? <ExcludeLeadButton leadId={conversation.leadId} iconOnly /> : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-b border-[var(--vp-ink-line)] bg-[var(--vp-surface-low)] px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => conversation.leadId && setStageOpen(true)}
                disabled={!conversation.leadId}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-[var(--vp-gold-classic)] bg-[var(--vp-gold-cream)] px-3 py-1 text-left disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--vp-ink-muted)]">Funil</span>
                  <span className="block truncate text-sm font-bold text-[var(--vp-wine)]">
                    {formatFunnelValue(stages.find((stage) => stage.id === conversation.stageId)?.name, conversation.substage)}
                  </span>
                </span>
                <CrmIcon name="expand_more" className="shrink-0 text-[18px] text-[var(--vp-gold-deep)]" />
              </button>
              {conversation.leadId ? (
                <ForwardDistributorByCepButton
                  conversationId={conversation.id}
                  leadId={conversation.leadId}
                  initialZipCode={conversation.zipCode}
                  appearance="strip"
                  onAssigned={(next) => {
                    setDistributorId(next.distributorId);
                    setView((current) =>
                      current
                        ? {
                            ...current,
                            conversation: {
                              ...current.conversation,
                              stageId: next.stageId,
                              substage: next.substage,
                              distributorId: next.distributorId,
                              distributorName: next.distributorName,
                              zipCode: next.zipCode,
                            },
                          }
                        : current,
                    );
                  }}
                />
              ) : (
                <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[10px] font-extrabold text-[var(--vp-ink-soft)]">CEP</span>
              )}
              <button
                type="button"
                disabled={!conversation.leadId || panelLoading}
                onClick={() => void openLeadPanel()}
                className="flex h-12 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-wine)] disabled:opacity-60"
              >
                <CrmIcon name="contact_page" className="text-[18px]" />
                <span className="text-[10px] font-extrabold">{panelLoading ? "…" : "Ficha"}</span>
              </button>
            </div>
            {view.leadPanel ? (
              <InboxLeadPanelDrawer
                key={conversation.id}
                {...view.leadPanel}
                stages={stages}
                substages={substages}
                distributors={distributors}
                initialDistributorId={distributorId || null}
                distributorName={conversation.distributorName}
                onDistributorChange={saveDistributor}
                initialStageId={conversation.stageId ?? view.leadPanel.initialStageId}
                initialSubstage={conversation.substage ?? view.leadPanel.initialSubstage}
                hideTrigger
                open={panelOpen}
                onOpenChange={setPanelOpen}
              />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--vp-paper)] px-[18px] max-md:px-3.5"><ChatThread key={conversation.id} conversationId={conversation.id} initialMessages={view.messages} hasMoreOlder={view.hasMoreOlder} messagesLoadError={view.messagesLoadError} lastReadAtIso={conversation.lastReadAt} /></div>
            <div className="shrink-0 border-t border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-[18px] pb-4 pt-3 max-md:px-3 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:pt-2.5"><SendMessageForm key={conversation.id} conversationId={conversation.id} phone={conversation.phone} firstName={conversation.firstName} comercialFirstName={view.comercialFirstName} /></div>
            <MobileSheet open={moreOpen} title="Conversa" onClose={() => setMoreOpen(false)}>
              <div className="px-4 pb-3">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--vp-gold-deep)]">Documentos</p>
                <DocumentSearch conversationId={conversation.id} className="px-0 pb-0" />
              </div>
              <div className="border-t border-[var(--vp-ink-line)]">
                {conversation.leadExcluded && conversation.leadId ? (
                  <div className="px-4 py-3"><RestoreLeadButton leadId={conversation.leadId} /></div>
                ) : conversation.leadId ? (
                  <ExcludeLeadButton leadId={conversation.leadId} menu />
                ) : (
                  <p className="px-4 py-3 text-sm text-[var(--vp-ink-muted)]">Esta conversa não tem ficha para arquivar.</p>
                )}
              </div>
            </MobileSheet>
            <InboxStageSheet
              open={stageOpen}
              onClose={() => setStageOpen(false)}
              conversationId={conversation.id}
              leadId={conversation.leadId}
              contactName={conversation.headerName}
              stages={stages}
              substages={substages}
              stageId={conversation.stageId}
              substage={conversation.substage}
              zipCode={conversation.zipCode}
              onSaved={(next) => {
                setView((current) =>
                  current
                    ? {
                        ...current,
                        conversation: {
                          ...current.conversation,
                          stageId: next.stageId,
                          substage: next.substage,
                        },
                      }
                    : current,
                );
              }}
              onAssigned={(next) => {
                setDistributorId(next.distributorId);
                setView((current) =>
                  current
                    ? {
                        ...current,
                        conversation: {
                          ...current.conversation,
                          stageId: next.stageId,
                          substage: next.substage,
                          distributorId: next.distributorId,
                          distributorName: next.distributorName,
                          zipCode: next.zipCode,
                        },
                      }
                    : current,
                );
              }}
            />
          </>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12">
            <div className="absolute left-1 top-1">
              <InboxMobileBackButton />
            </div>
            <span
              className="grid size-16 place-items-center rounded-full bg-[var(--vp-surface)] text-[var(--vp-wine)]"
              aria-hidden
            >
              <CrmIcon name="chat" className="text-3xl" />
            </span>
            <div className="max-w-sm space-y-1.5 text-center">
              <p className="text-base font-bold text-[var(--vp-ink-body)]">Selecione uma conversa</p>
              <p className="text-sm text-[var(--vp-ink-muted)]">
                As mensagens aparecem aqui quando você escolher um contato na lista.
              </p>
            </div>
          </div>
        )}
      </section>
  );
}
