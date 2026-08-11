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
import { PaginationNav } from "@/components/pagination-nav";
import { MarkConversationRead } from "./mark-conversation-read";
import { InboxTasksPanel, type InboxTaskRow } from "./inbox-tasks-panel";
import { SendMessageForm } from "./send-message-form";
import { ExcludeLeadButton, RestoreLeadButton } from "./exclude-lead-actions";
import {
  isLeadExcludedFromPipeline,
  leadExclusionReasonLabel,
} from "@/lib/lead-pipeline-exclusion";

const TEAM_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  const role = TEAM_ROLE_LABEL[p.role] ?? p.role;
  return { id: p.id, label: `${name} (${role})` };
}

/** Evita cache estático: mensagens novas precisam aparecer após webhook / envio. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREVIEW_MAX = 80;
const PAGE_SIZE = 40;
type InboxTab = "qualify" | "pipeline" | "groups" | "archived";
type ConversationRow = {
  id: string;
  phone_e164: string;
  conversation_kind: string;
  group_display_name: string | null;
  classification: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
  leads: unknown;
};

function previewLine(body: string | null | undefined): string {
  const t = (body ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Sem mensagem ainda";
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t;
}

function isConversationUnread(
  lastReadAt: string | null | undefined,
  maxInboundSentAt: string | undefined,
): boolean {
  if (!maxInboundSentAt) return false;
  const lr = (lastReadAt ?? "").trim();
  if (!lr) return true;
  return maxInboundSentAt > lr;
}

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => Array.from(p)[0]?.toUpperCase() ?? "").join("") || "?";
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
  searchParams: Promise<{ cid?: string; tab?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { cid, tab } = params;
  const requestedPage = params.page ? Number.parseInt(params.page, 10) : 1;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const activeTab: InboxTab =
    tab === "groups"
      ? "groups"
      : tab === "archived"
        ? "archived"
        : tab === "pipeline"
          ? "pipeline"
          : "qualify";
  const conversationKind = activeTab === "groups" ? "group" : "lead";
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const stagesPromise = crm
    .from("pipeline_stages")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });
  const { data: stages } = await stagesPromise;
  const entryStageId =
    stages?.find((stage) => stage.name.trim().toUpperCase() === "LEADS")?.id ?? null;
  const opportunityRelation: string =
    activeTab === "pipeline" || activeTab === "qualify"
      ? "opportunities!inner(id, stage_id, updated_at)"
      : "opportunities(id, stage_id, updated_at)";
  const leadRelation: string =
    activeTab === "groups"
      ? "leads(id, phone_e164, status, owner_id, client_category, zip_code, weekly_bread_consumption, bread_type, bread_weight_grams, excluded_from_pipeline_at, excluded_reason, contacts(full_name, avatar_url), companies(id, name, document, city, state), distributors(name), opportunities(id, stage_id, updated_at))"
      : `leads!inner(id, phone_e164, status, owner_id, client_category, zip_code, weekly_bread_consumption, bread_type, bread_weight_grams, excluded_from_pipeline_at, excluded_reason, contacts(full_name, avatar_url), companies(id, name, document, city, state), distributors(name), ${opportunityRelation})`;
  const conversationSelect: string =
    `id, phone_e164, conversation_kind, group_display_name, classification, last_message_at, created_at, updated_at, last_read_at, ${leadRelation}`;
  let conversationsQuery = crm
    .from("conversations")
    .select(conversationSelect, { count: "exact" })
    .eq("conversation_kind", conversationKind);
  if (activeTab === "qualify") {
    conversationsQuery = conversationsQuery.is("leads.excluded_from_pipeline_at", null);
    if (entryStageId) {
      conversationsQuery = conversationsQuery.eq("leads.opportunities.stage_id", entryStageId);
    }
  } else if (activeTab === "pipeline") {
    conversationsQuery = conversationsQuery.is("leads.excluded_from_pipeline_at", null);
    if (entryStageId) {
      conversationsQuery = conversationsQuery.neq("leads.opportunities.stage_id", entryStageId);
    }
  } else if (activeTab === "archived") {
    conversationsQuery = conversationsQuery.not("leads.excluded_from_pipeline_at", "is", null);
  }

  const conversationsResult = await conversationsQuery
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const conversations = (conversationsResult.data ?? []) as unknown as ConversationRow[];
  const conversationsError = conversationsResult.error;
  const conversationsCount = conversationsResult.count;

  const pageConversationIds = (conversations ?? []).map((conversation) => conversation.id);
  const requestedMessagesPromise = cid ? loadRecentConversationMessages(crm, cid) : null;

  let selectedOutsidePage: ConversationRow | null = null;
  let selectedConversationError: { message: string; code?: string } | null = null;
  if (cid && !pageConversationIds.includes(cid)) {
    let selectedQuery = crm
      .from("conversations")
      .select(conversationSelect)
      .eq("id", cid)
      .eq("conversation_kind", conversationKind);
    if (activeTab === "qualify") {
      selectedQuery = selectedQuery.is("leads.excluded_from_pipeline_at", null);
      if (entryStageId) {
        selectedQuery = selectedQuery.eq("leads.opportunities.stage_id", entryStageId);
      }
    } else if (activeTab === "pipeline") {
      selectedQuery = selectedQuery.is("leads.excluded_from_pipeline_at", null);
      if (entryStageId) {
        selectedQuery = selectedQuery.neq("leads.opportunities.stage_id", entryStageId);
      }
    } else if (activeTab === "archived") {
      selectedQuery = selectedQuery.not("leads.excluded_from_pipeline_at", "is", null);
    }
    const selectedResult = await selectedQuery.maybeSingle();
    selectedOutsidePage = (selectedResult.data as unknown as ConversationRow | null) ?? null;
    selectedConversationError = selectedResult.error;
  }

  const loadedConversationIds = selectedOutsidePage
    ? [...pageConversationIds, selectedOutsidePage.id]
    : pageConversationIds;
  const { data: tails, error: tailsError } =
    loadedConversationIds.length > 0
      ? await crm
          .from("v_conversation_last_message")
          .select(
            "conversation_id, lead_id, last_direction, last_sent_at, last_body_preview, event_kind, event_status, last_inbound_sent_at",
          )
          .in("conversation_id", loadedConversationIds)
      : { data: [], error: null };

  const tailById = new Map((tails ?? []).map((t) => [t.conversation_id, t]));

  const conversationsSorted = [...(conversations ?? [])]
    .filter((c) => {
      if (activeTab === "groups") return true;
      const lead = nestOne(
        c.leads as { excluded_from_pipeline_at?: string | null } | { excluded_from_pipeline_at?: string | null }[] | null,
      );
      const archived = isLeadExcludedFromPipeline(lead);
      if (activeTab === "archived") return archived;
      return !archived;
    })
    .sort((a, b) => {
      const ta = tailById.get(a.id)?.last_sent_at ?? a.last_message_at ?? a.created_at;
      const tb = tailById.get(b.id)?.last_sent_at ?? b.last_message_at ?? b.created_at;
      return tb.localeCompare(ta);
    });

  const selected = cid
    ? conversationsSorted.find((c) => c.id === cid) ?? selectedOutsidePage
    : conversationsSorted[0] ?? null;
  const selectedId = selected?.id ?? null;

  let messages: InboxMessageRow[] = [];
  let hasMoreOlder = false;
  let messagesError: { message: string; code?: string } | undefined;

  if (selectedId) {
    const res =
      selectedId === cid && requestedMessagesPromise
        ? await requestedMessagesPromise
        : await loadRecentConversationMessages(crm, selectedId);
    messages = res.messages;
    hasMoreOlder = res.hasMoreOlder;
    messagesError = res.error;
  }

  const selectedTail = selected ? tailById.get(selected.id) : undefined;
  const awaitingReply = selectedTail?.last_direction === "in";

  const dbError =
    conversationsError?.message ??
    selectedConversationError?.message ??
    messagesError?.message ??
    tailsError?.message;
  const schemaHint =
    conversationsError?.code === "PGRST106" ||
    messagesError?.code === "PGRST106" ||
    tailsError?.code === "PGRST106" ||
    selectedConversationError?.code === "PGRST106"
      ? "No Supabase: Settings → Data API → Exposed schemas → inclua o schema «crm» (o mesmo ajuste do webhook)."
      : null;

  const selectedLead = selected
    ? nestOne(
        selected.leads as
          | {
              id: string;
              status: string;
              excluded_from_pipeline_at?: string | null;
              excluded_reason?: string | null;
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
              excluded_from_pipeline_at?: string | null;
              excluded_reason?: string | null;
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

  const selectedLeadExcluded = isLeadExcludedFromPipeline(selectedLead);

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

  let inboxLeadTasks: InboxTaskRow[] = [];
  let inboxTeamOptions: { id: string; label: string }[] = [];
  let inboxOpportunityId = selectedOpportunity?.id ?? null;
  let inboxLeadOwnerId: string | null = null;

  if (selectedLead?.id) {
    const leadId = selectedLead.id;
    inboxLeadOwnerId = (selectedLead as { owner_id?: string | null }).owner_id ?? null;
    const [leadTasksResult, teamProfilesResult, latestOppResult] = await Promise.all([
      crm
        .from("tasks")
        .select("id, title, due_at, done, assignee_id")
        .eq("lead_id", leadId)
        .order("done", { ascending: true })
        .order("due_at", { ascending: true, nullsFirst: false }),
      crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
      crm
        .from("opportunities")
        .select("id")
        .eq("lead_id", leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    inboxLeadTasks = (leadTasksResult.data ?? []) as InboxTaskRow[];
    inboxTeamOptions = (teamProfilesResult.data ?? []).map(formatTeamOption);
    inboxOpportunityId = latestOppResult.data?.id ?? selectedOpportunity?.id ?? null;
  }

  const inboxAssigneeLabels = Object.fromEntries(inboxTeamOptions.map((o) => [o.id, o.label]));

  const sidebarRows: InboxSidebarRow[] = conversationsSorted.map((c) => {
    const lead = nestOne(
      c.leads as
        | {
            id: string;
            status: string;
            excluded_from_pipeline_at?: string | null;
            excluded_reason?: string | null;
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
            excluded_from_pipeline_at?: string | null;
            excluded_reason?: string | null;
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
        ? c.group_display_name?.trim() || c.phone_e164
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
            ? isLeadExcludedFromPipeline(lead)
              ? `Arquivado · ${leadExclusionReasonLabel(lead.excluded_reason)}`
              : activeTab === "pipeline"
                ? "No funil"
                : "Para qualificar"
            : "Sem lead",
      awaiting: tail?.last_direction === "in",
      identityName,
      companyName: companyLine,
      clientCategory: lead?.client_category ?? null,
      unread: isConversationUnread(
        (c as { last_read_at?: string | null }).last_read_at,
        tail?.last_inbound_sent_at ?? undefined,
      ),
      callStatus:
        tail?.event_kind === "whatsapp_call" &&
        (tail.event_status === "ringing" ||
          tail.event_status === "missed_voice" ||
          tail.event_status === "missed_video")
          ? tail.event_status
          : null,
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <InboxLiveRefresh selectedConversationId={selectedId} />
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1">
            <InboxSidebar
              conversations={sidebarRows}
              selectedId={selectedId}
              activeTab={activeTab}
            />
          </div>
          <PaginationNav
            pathname="/inbox"
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={conversationsCount ?? 0}
            searchParams={{ ...params, cid: undefined }}
          />
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          {selected ? (
            <>
              <MarkConversationRead
                conversationId={selected.id}
                fingerprint={`${selectedTail?.last_sent_at ?? ""}|${selectedTail?.last_direction ?? ""}|${selectedTail?.last_body_preview ?? ""}`}
              />
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
                        ? selected.group_display_name?.trim() || selected.phone_e164
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
                            phone={
                              selected.conversation_kind === "lead"
                                ? selected.phone_e164
                                : null
                            }
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
                  {selectedLeadExcluded ? (
                    <p className="mt-2 rounded-md border border-[var(--border)] bg-[rgba(35,0,4,0.04)] px-2 py-1.5 text-xs text-[var(--muted)]">
                      Arquivado — fora do funil e da lista de prospects. O chat continua ativo.
                    </p>
                  ) : null}
                  </div>
                  {selected.conversation_kind === "lead" && selectedLead?.id ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {selectedLeadExcluded ? (
                        <RestoreLeadButton leadId={selectedLead.id} />
                      ) : (
                        <>
                          <InboxTasksPanel
                            leadId={selectedLead.id}
                            leadLabel={displayPersonName(
                              nestOne(
                                (selectedLead.contacts ?? null) as
                                  | { full_name: string | null }
                                  | { full_name: string | null }[]
                                  | null,
                              )?.full_name,
                            )}
                            opportunityId={inboxOpportunityId}
                            tasks={inboxLeadTasks}
                            teamOptions={inboxTeamOptions}
                            assigneeLabels={inboxAssigneeLabels}
                            defaultAssigneeId={inboxLeadOwnerId}
                          />
                          <LeadQualificationModal
                            conversationId={selected.id}
                            initialCategory={selectedLead?.client_category ?? null}
                            initialStageId={selectedOpportunity?.stage_id ?? null}
                            initialState={selectedCompany?.state ?? null}
                            initialCity={selectedCompany?.city ?? null}
                            initialZipCode={selectedLead?.zip_code ?? null}
                            initialWeeklyBreadConsumption={
                              selectedLead?.weekly_bread_consumption ?? null
                            }
                            initialCompanyName={selectedCompany?.name ?? null}
                            initialCnpj={selectedCompany?.document ?? null}
                            initialBreadType={selectedLead?.bread_type ?? null}
                            initialBreadWeightGrams={selectedLead?.bread_weight_grams ?? null}
                            stages={(stages ?? []).map((stage) => ({
                              id: stage.id,
                              name: stage.name,
                            }))}
                          />
                          <ExcludeLeadButton leadId={selectedLead.id} />
                        </>
                      )}
                    </div>
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
                  lastReadAtIso={(selected as { last_read_at?: string | null }).last_read_at ?? null}
                />
              </div>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--vp-paper)] px-3 pb-3 pt-3">
                <SendMessageForm conversationId={selected.id} phone={selected.phone_e164} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-12">
              <p className="text-center text-sm text-[var(--muted)]">
                {cid
                  ? "Esta conversa não está mais nesta lista. Ela pode ter sido movida, arquivada ou excluída."
                  : "Nenhuma conversa para mostrar."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
