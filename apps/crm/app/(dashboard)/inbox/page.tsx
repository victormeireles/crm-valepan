import { LeadIdentity } from "@/components/lead-identity";
import {
  loadRecentConversationMessages,
  type InboxMessageRow,
} from "@/lib/inbox/load-messages";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { ChatThread } from "./chat-thread";
import { InboxLiveRefresh } from "./inbox-live-refresh";
import { InboxSidebar, type InboxSidebarRow } from "./inbox-sidebar";
import { LeadQualificationModal } from "./lead-qualification-modal";
import { SendMessageForm } from "./send-message-form";

/** Evita cache estático: mensagens novas precisam aparecer após webhook / envio. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREVIEW_MAX = 80;
type InboxTab = "leads" | "groups";

function previewLine(body: string | null | undefined): string {
  const t = (body ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Sem mensagem ainda";
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t;
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function validAvatarUrl(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "null" || low === "undefined") return null;
  return t;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string; tab?: string }>;
}) {
  const { cid, tab } = await searchParams;
  const activeTab: InboxTab = tab === "groups" ? "groups" : "leads";
  const conversationKind = activeTab === "groups" ? "group" : "lead";
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const [{ data: conversations, error: conversationsError }, { data: tails, error: tailsError }] =
    await Promise.all([
      crm
        .from("conversations")
        .select(
          "id, phone_e164, conversation_kind, classification, created_at, updated_at, leads(id, phone_e164, status, client_category, zip_code, weekly_bread_consumption, bread_type, bread_weight_grams, contacts(full_name, avatar_url), companies(id, name, document, city, state), distributors(name), opportunities(id, stage_id, updated_at))",
        )
        .eq("conversation_kind", conversationKind)
        .order("updated_at", { ascending: false }),
      crm
        .from("v_conversation_last_message")
        .select("conversation_id, lead_id, last_direction, last_sent_at, last_body_preview"),
    ]);

  const tailById = new Map((tails ?? []).map((t) => [t.conversation_id, t]));

  const conversationsSorted = [...(conversations ?? [])].sort((a, b) => {
    const ta = tailById.get(a.id)?.last_sent_at ?? a.updated_at;
    const tb = tailById.get(b.id)?.last_sent_at ?? b.updated_at;
    return tb.localeCompare(ta);
  });

  const validCid =
    cid && conversationsSorted.some((c) => c.id === cid) ? cid : null;
  const selectedId = validCid ?? conversationsSorted[0]?.id ?? null;
  const selected = conversationsSorted.find((c) => c.id === selectedId) ?? null;

  let messages: InboxMessageRow[] = [];
  let hasMoreOlder = false;
  let messagesError: { message: string; code?: string } | undefined;

  if (selectedId) {
    const res = await loadRecentConversationMessages(crm, selectedId);
    messages = res.messages;
    hasMoreOlder = res.hasMoreOlder;
    messagesError = res.error;
  }

  const selectedTail = selected ? tailById.get(selected.id) : undefined;
  const awaitingReply = selectedTail?.last_direction === "in";

  const dbError =
    conversationsError?.message ?? messagesError?.message ?? tailsError?.message;
  const schemaHint =
    conversationsError?.code === "PGRST106" ||
    messagesError?.code === "PGRST106" ||
    tailsError?.code === "PGRST106"
      ? "No Supabase: Settings → Data API → Exposed schemas → inclua o schema «crm» (o mesmo ajuste do webhook)."
      : null;

  const selectedLead = selected
    ? nestOne(
        selected.leads as
          | {
              id: string;
              status: string;
              client_category?: string | null;
              zip_code?: string | null;
              weekly_bread_consumption?: number | null;
              bread_type?: string | null;
              bread_weight_grams?: number | null;
              companies?:
                | {
                    id: string;
                    name: string | null;
                    document: string | null;
                    city: string | null;
                    state: string | null;
                  }
                | {
                    id: string;
                    name: string | null;
                    document: string | null;
                    city: string | null;
                    state: string | null;
                  }[]
                | null;
              opportunities?:
                | { id: string; stage_id: string; updated_at: string }
                | { id: string; stage_id: string; updated_at: string }[]
                | null;
              contacts?:
                | { full_name: string | null; avatar_url?: string | null }
                | { full_name: string | null; avatar_url?: string | null }[]
                | null;
              distributors?:
                | { name: string | null }
                | { name: string | null }[]
                | null;
            }
          | {
              id: string;
              status: string;
              client_category?: string | null;
              zip_code?: string | null;
              weekly_bread_consumption?: number | null;
              bread_type?: string | null;
              bread_weight_grams?: number | null;
              companies?:
                | {
                    id: string;
                    name: string | null;
                    document: string | null;
                    city: string | null;
                    state: string | null;
                  }
                | {
                    id: string;
                    name: string | null;
                    document: string | null;
                    city: string | null;
                    state: string | null;
                  }[]
                | null;
              opportunities?:
                | { id: string; stage_id: string; updated_at: string }
                | { id: string; stage_id: string; updated_at: string }[]
                | null;
              contacts?:
                | { full_name: string | null; avatar_url?: string | null }
                | { full_name: string | null; avatar_url?: string | null }[]
                | null;
              distributors?:
                | { name: string | null }
                | { name: string | null }[]
                | null;
            }[]
          | null,
      )
    : null;

  const selectedCompany = nestOne(
    (selectedLead?.companies ?? null) as
      | { id: string; name: string | null; document: string | null; city: string | null; state: string | null }
      | {
          id: string;
          name: string | null;
          document: string | null;
          city: string | null;
          state: string | null;
        }[]
      | null,
  );

  const selectedDistributor = nestOne(
    (selectedLead?.distributors ?? null) as
      | { name: string | null }
      | { name: string | null }[]
      | null,
  );

  const selectedOpportunity = nestOne(
    (selectedLead?.opportunities ?? null) as
      | { id: string; stage_id: string; updated_at: string }
      | { id: string; stage_id: string; updated_at: string }[]
      | null,
  );

  const { data: stages } = await crm
    .from("pipeline_stages")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const sidebarRows: InboxSidebarRow[] = conversationsSorted.map((c) => {
    const lead = nestOne(
      c.leads as
        | {
            id: string;
            status: string;
            client_category?: string | null;
            contacts?:
              | { full_name: string | null; avatar_url?: string | null }
              | { full_name: string | null; avatar_url?: string | null }[]
              | null;
            companies?:
              | { name: string | null }
              | { name: string | null }[]
              | null;
            distributors?:
              | { name: string | null }
              | { name: string | null }[]
              | null;
          }
        | {
            id: string;
            status: string;
            client_category?: string | null;
            contacts?:
              | { full_name: string | null; avatar_url?: string | null }
              | { full_name: string | null; avatar_url?: string | null }[]
              | null;
            companies?:
              | { name: string | null }
              | { name: string | null }[]
              | null;
            distributors?:
              | { name: string | null }
              | { name: string | null }[]
              | null;
          }[]
        | null,
    );
    const contact = nestOne(
      (lead?.contacts ?? null) as
        | { full_name: string | null; avatar_url?: string | null }
        | { full_name: string | null; avatar_url?: string | null }[]
        | null,
    );
    const contactName = contact?.full_name?.trim() || null;
    const avatarUrl = validAvatarUrl(
      typeof contact?.avatar_url === "string" ? contact.avatar_url : null,
    );
    const tail = tailById.get(c.id);

    const company = nestOne(
      (lead?.companies ?? null) as
        | { name: string | null }
        | { name: string | null }[]
        | null,
    );
    const distributor = nestOne(
      (lead?.distributors ?? null) as
        | { name: string | null }
        | { name: string | null }[]
        | null,
    );
    const companyLine =
      c.conversation_kind === "group" || !lead
        ? null
        : displayCompanyName({
            companyName: company?.name,
            distributorName: distributor?.name,
            clientCategory: lead.client_category,
          });
    const identityName =
      c.conversation_kind === "group"
        ? "Grupo"
        : lead
          ? displayPersonName(contact?.full_name)
          : "Sem lead";

    return {
      id: c.id,
      kind: c.conversation_kind === "group" ? "group" : "lead",
      displayName: contactName ?? c.phone_e164,
      phone_e164: c.phone_e164,
      avatarUrl,
      preview: previewLine(tail?.last_body_preview),
      lastAt: tail?.last_sent_at ?? c.updated_at,
      leadLine:
        c.conversation_kind === "group"
          ? "Conversa em grupo"
          : lead
            ? `Status: ${lead.status}`
            : "Sem lead",
      awaiting: tail?.last_direction === "in",
      identityName,
      companyName: companyLine,
      clientCategory: lead?.client_category ?? null,
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <InboxLiveRefresh />
      {dbError ? (
        <div
          className="shrink-0 rounded-lg border border-[color:var(--border-strong)] bg-[var(--vp-surface)] px-3 py-2 text-sm text-[var(--vp-wine-classic)]"
          role="alert"
        >
          <p className="font-medium">Não foi possível carregar dados do CRM.</p>
          <p className="mt-1 font-mono text-xs opacity-90">{dbError}</p>
          {schemaHint ? <p className="mt-2 text-xs">{schemaHint}</p> : null}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40vh)_minmax(0,1fr)] gap-2 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="h-full min-h-0 overflow-hidden">
          <InboxSidebar
            conversations={sidebarRows}
            selectedId={selectedId}
            activeTab={activeTab}
          />
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          {selected ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--vp-paper)] px-3 pb-3 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                  {(() => {
                    const selectedContact = nestOne(
                      (selectedLead?.contacts ?? null) as
                        | { full_name: string | null; avatar_url?: string | null }
                        | { full_name: string | null; avatar_url?: string | null }[]
                        | null,
                    );
                    const headerName =
                      selected.conversation_kind === "group"
                        ? "Grupo"
                        : selectedLead
                          ? displayPersonName(selectedContact?.full_name)
                          : "Sem lead";
                    const headerCompany =
                      selected.conversation_kind === "group" || !selectedLead
                        ? null
                        : displayCompanyName({
                            companyName: selectedCompany?.name,
                            distributorName: selectedDistributor?.name,
                            clientCategory: selectedLead.client_category,
                          });
                    const avatarUrl = validAvatarUrl(
                      typeof selectedContact?.avatar_url === "string"
                        ? selectedContact.avatar_url
                        : null,
                    );
                    const avatarLabel = headerName;
                    return (
                      <div className="flex min-w-0 items-start gap-2">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={`Foto de ${avatarLabel}`}
                            className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(35,0,4,0.14)] text-xs font-semibold text-[var(--vp-wine)]"
                            aria-label={`Avatar de ${avatarLabel}`}
                            title={avatarLabel}
                          >
                            {initials(avatarLabel)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <LeadIdentity
                            name={headerName}
                            companyName={headerCompany}
                            category={
                              selected.conversation_kind === "lead"
                                ? selectedLead?.client_category
                                : null
                            }
                            phoneTitle={selected.phone_e164}
                            size="md"
                            layout="stacked"
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-[var(--muted)]">
                    Última atividade na conversa:{" "}
                    {new Date(selectedTail?.last_sent_at ?? selected.updated_at).toLocaleString("pt-BR")}
                  </p>
                  {awaitingReply ? (
                    <p className="mt-1 text-xs font-medium text-[var(--vp-wine)]">
                      Aguarda a sua resposta (última mensagem foi do cliente).
                    </p>
                  ) : null}
                  </div>
                  {selected.conversation_kind === "lead" ? (
                    <LeadQualificationModal
                      conversationId={selected.id}
                      initialCategory={selectedLead?.client_category ?? null}
                      initialStageId={selectedOpportunity?.stage_id ?? null}
                      initialState={selectedCompany?.state ?? null}
                      initialCity={selectedCompany?.city ?? null}
                      initialZipCode={selectedLead?.zip_code ?? null}
                      initialWeeklyBreadConsumption={selectedLead?.weekly_bread_consumption ?? null}
                      initialCompanyName={selectedCompany?.name ?? null}
                      initialCnpj={selectedCompany?.document ?? null}
                      initialBreadType={selectedLead?.bread_type ?? null}
                      initialBreadWeightGrams={selectedLead?.bread_weight_grams ?? null}
                      stages={(stages ?? []).map((stage) => ({ id: stage.id, name: stage.name }))}
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--vp-paper)] px-3">
                <ChatThread
                  key={selected.id}
                  conversationId={selected.id}
                  initialMessages={messages}
                  hasMoreOlder={hasMoreOlder}
                  messagesLoadError={messagesError?.message}
                />
              </div>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--vp-paper)] px-3 pb-3 pt-3">
                <SendMessageForm conversationId={selected.id} phone={selected.phone_e164} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-12">
              <p className="text-center text-sm text-[var(--muted)]">Nenhuma conversa para mostrar.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
