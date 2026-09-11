import {
  INBOX_MESSAGES_VISIBLE_SINCE,
  loadRecentConversationMessages,
  type InboxMessageRow,
} from "@/lib/inbox/load-messages";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { InboxLiveRefresh } from "./inbox-live-refresh";
import { InboxSidebar, type InboxSidebarRow } from "./inbox-sidebar";
import { PaginationNav } from "@/components/pagination-nav";
import { InboxConversationPane } from "./inbox-conversation-pane";
import type { InboxConversationView } from "@/app/actions/inbox";
import {
  isLeadExcludedFromPipeline,
  leadExclusionReasonLabel,
} from "@/lib/lead-pipeline-exclusion";
import { getWeeklyBreadCount } from "@/lib/lead-signals";
import type { Database } from "@/lib/database.types";
import {
  logInboxPerformance,
  timeInboxOperation,
  type InboxPerformanceOperation,
} from "@/lib/inbox-performance";

/** Evita cache estático: mensagens novas precisam aparecer após webhook / envio. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREVIEW_MAX = 80;
const PAGE_SIZE = 20;
type InboxTab = "qualify" | "archived" | "groups" | "pipeline";
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
type InboxSidebarSnapshotRow = Database["crm"]["Functions"]["inbox_sidebar_snapshot"]["Returns"][number];

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
  searchParams: Promise<{ cid?: string; tab?: string; page?: string; q?: string; lookup?: string }>;
}) {
  const pageStartedAt = performance.now();
  const performanceOperations: InboxPerformanceOperation[] = [];
  async function timed<T>(operation: string, work: PromiseLike<T>) {
    const result = await timeInboxOperation(operation, work);
    performanceOperations.push(result);
    return result.value;
  }
  const renderNowMs = Date.now();
  const params = await timed("search_params", searchParams);
  const { cid, tab } = params;
  const inboxQuery = typeof params.q === "string" ? params.q.trim() : "";
  const inboxQueryDigits = inboxQuery.replace(/\D/g, "");
  const isPhoneSearch = inboxQueryDigits.length >= 4;
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
  const supabase = await timed("supabase_client", createServerSupabaseClient());
  const crm = crmTables(supabase);
  const conversationSelect =
    "id, phone_e164, conversation_kind, group_display_name, classification, last_message_at, created_at, updated_at, last_read_at, leads(id, client_category, excluded_from_pipeline_at, excluded_reason, contacts(full_name, avatar_url), companies(name, city, state), distributors(name))";
  // A conversa solicitada já vem na URL; carregue suas mensagens enquanto a
  // barra lateral e a etapa inicial são consultadas.
  const requestedMessagesPromise = cid ? timed("messages_initial", loadRecentConversationMessages(crm, cid)) : null;
  const requestedConversationPromise = cid
    ? timed("selected_conversation", crm.from("conversations").select(conversationSelect).eq("id", cid).maybeSingle())
    : null;
  const stagesPromise = timed("pipeline_stages", crm
    .from("pipeline_stages")
    .select("id, name, sort_order, is_final")
    .order("sort_order", { ascending: true }));
  const snapshotPromise = timed("sidebar_snapshot", crm.rpc("inbox_sidebar_snapshot", {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_tab: activeTab,
    p_offset: (page - 1) * PAGE_SIZE,
    p_limit: PAGE_SIZE,
    p_query: isPhoneSearch ? inboxQuery : null,
  }));
  const [{ data: stages }, snapshotResult, requestedConversationResult] = await Promise.all([
    stagesPromise,
    snapshotPromise,
    requestedConversationPromise,
  ]);
  const snapshotRows = (snapshotResult.data ?? []) as InboxSidebarSnapshotRow[];
  const snapshotMeta = snapshotRows[0];
  const compactRows = snapshotRows.filter(
    (row) => row.conversation_id && row.phone_e164 && row.conversation_kind && row.created_at && row.updated_at,
  );
  const conversations: ConversationRow[] = compactRows.map((row) => ({
    id: row.conversation_id!,
    phone_e164: row.phone_e164!,
    conversation_kind: row.conversation_kind!,
    group_display_name: row.group_display_name,
    classification: row.classification,
    last_message_at: row.last_message_at,
    created_at: row.created_at!,
    updated_at: row.updated_at!,
    last_read_at: row.last_read_at,
    leads: row.lead_id
      ? {
          id: row.lead_id,
          status: "open",
          owner_id: null,
          client_category: row.client_category,
          weekly_bread_consumption: row.weekly_bread_consumption,
          bread_weight_grams: row.bread_weight_grams,
          excluded_from_pipeline_at: row.excluded_from_pipeline_at,
          contacts: { full_name: row.contact_name, avatar_url: row.avatar_url },
          companies: row.company_name ? { name: row.company_name } : null,
          distributors: row.distributor_name ? { name: row.distributor_name } : null,
          opportunities: row.stage_id ? { stage_id: row.stage_id } : null,
        }
      : null,
  }));
  const conversationsError = snapshotResult.error;
  const conversationsCount = Number(snapshotMeta?.tab_total ?? 0);
  const tabCounts = {
    qualify: Number(snapshotMeta?.qualify_count ?? 0),
    archived: Number(snapshotMeta?.archived_count ?? 0),
    groups: Number(snapshotMeta?.groups_count ?? 0),
    pipeline: Number(snapshotMeta?.pipeline_count ?? 0),
  };
  const tailById = new Map(compactRows.map((row) => [row.conversation_id!, {
    conversation_id: row.conversation_id!,
    lead_id: row.lead_id,
    last_direction: row.last_direction,
    last_sent_at: row.last_sent_at,
    last_body_preview: row.last_body_preview,
    event_kind: row.event_kind,
    event_status: row.event_status,
    last_inbound_sent_at: row.last_inbound_sent_at,
  }]));

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

  // Sem `cid`, a primeira conversa já veio na RPC compacta. Reconsultá-la
  // atrasava o início da busca das mensagens sem acrescentar dados essenciais;
  // a ficha completa permanece disponível pela ação sob demanda.
  const selectedResult = requestedConversationResult ?? {
    data: conversationsSorted[0] ?? null,
    error: null,
  };
  const selected = (selectedResult.data as unknown as ConversationRow | null) ?? null;
  const selectedConversationError = selectedResult.error;
  const selectedId = selected?.id ?? null;

  let messages: InboxMessageRow[] = [];
  let hasMoreOlder = false;
  let messagesError: { message: string; code?: string } | undefined;

  if (selectedId) {
    const res =
      selectedId === cid && requestedMessagesPromise
        ? await requestedMessagesPromise
        : await timed("messages_initial", loadRecentConversationMessages(crm, selectedId));
    messages = res.messages;
    hasMoreOlder = res.hasMoreOlder;
    messagesError = res.error;
  }

  const selectedTail = selected ? tailById.get(selected.id) : undefined;
  const dbError =
    conversationsError?.message ??
    selectedConversationError?.message ??
    messagesError?.message;
  const schemaHint =
    conversationsError?.code === "PGRST106" ||
    messagesError?.code === "PGRST106" ||
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
                | { id: string; stage_id: string; title: string | null; next_action_at: string | null; owner_id: string | null; updated_at: string }
                | { id: string; stage_id: string; title: string | null; next_action_at: string | null; owner_id: string | null; updated_at: string }[]
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
                | { id: string; stage_id: string; title: string | null; next_action_at: string | null; owner_id: string | null; updated_at: string }
                | { id: string; stage_id: string; title: string | null; next_action_at: string | null; owner_id: string | null; updated_at: string }[]
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

  const sidebarRows: InboxSidebarRow[] = conversationsSorted.map((c) => {
    const lead = nestOne(
      c.leads as
        | {
            id: string;
            status: string;
            excluded_from_pipeline_at?: string | null;
            excluded_reason?: string | null;
            client_category?: string | null;
            weekly_bread_consumption?: number | null;
            bread_weight_grams?: number | null;
            opportunities?: { stage_id: string } | { stage_id: string }[] | null;
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
            weekly_bread_consumption?: number | null;
            bread_weight_grams?: number | null;
            opportunities?: { stage_id: string } | { stage_id: string }[] | null;
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
    const opportunity = nestOne(lead?.opportunities ?? null);
    const stageName = (stages ?? []).find((stage) => stage.id === opportunity?.stage_id)?.name ?? null;

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
      stageName,
      weeklyBreadCount: getWeeklyBreadCount(lead?.weekly_bread_consumption),
      lastDirection: tail?.last_direction ?? null,
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

  const selectedContact = nestOne(
    (selectedLead?.contacts ?? null) as
      | { full_name: string | null; avatar_url?: string | null }
      | { full_name: string | null; avatar_url?: string | null }[]
      | null,
  );
  const selectedHeaderName = selected?.conversation_kind === "group"
    ? selected.group_display_name?.trim() || selected.phone_e164
    : selectedLead
      ? displayPersonName(selectedContact?.full_name)
      : "Sem lead";
  const selectedHeaderCompany = selected?.conversation_kind === "lead" && selectedLead
    ? displayCompanyName({
        companyName: selectedCompany?.name,
        distributorName: selectedDistributor?.name,
        clientCategory: selectedLead.client_category,
      })
    : null;
  const selectedAvatarUrl = validAvatarUrl(selectedContact?.avatar_url);
  const firstName = selectedHeaderName.trim().split(/\s+/)[0] || "cliente";
  const initialConversationView: InboxConversationView | null = selected
    ? {
        conversation: {
          id: selected.id,
          phone: selected.phone_e164,
          headerName: selectedHeaderName,
          headerCompany: selectedHeaderCompany,
          location: [selectedCompany?.city, selectedCompany?.state].filter(Boolean).join(", ") || null,
          avatarUrl: selectedAvatarUrl,
          firstName,
          lastReadAt: selected.last_read_at ?? null,
          lastDirection: selectedTail?.last_direction ?? null,
          lastSentAt: selectedTail?.last_sent_at ?? null,
          lastBodyPreview: selectedTail?.last_body_preview ?? null,
          leadId: selectedLead?.id ?? null,
          leadExcluded: selectedLeadExcluded,
        },
        messages,
        hasMoreOlder,
        ...(messagesError ? { messagesLoadError: messagesError.message } : {}),
        leadPanel: null,
      }
    : null;

  logInboxPerformance("initial_load", performance.now() - pageStartedAt, performanceOperations, {
    tab: activeTab,
    page,
    conversations: conversationsSorted.length,
    messages: messages.length,
    hasCid: Boolean(cid),
    hasError: Boolean(dbError),
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
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40vh)_minmax(0,1fr)] gap-4 overflow-hidden min-[900px]:grid-cols-[316px_minmax(0,1fr)] min-[900px]:grid-rows-1 xl:grid-cols-[316px_minmax(0,1fr)_348px]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1">
            <InboxSidebar
              conversations={sidebarRows}
              selectedId={selectedId}
              activeTab={activeTab}
              page={page}
              initialQuery={inboxQuery}
              renderNowMs={renderNowMs}
              tabCounts={tabCounts}
            />
          </div>
          <PaginationNav
            pathname="/inbox"
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={conversationsCount ?? 0}
            searchParams={{ ...params, cid: undefined }}
            showBoundaryLinks
          />
        </div>

        <InboxConversationPane initialView={initialConversationView} />
      </div>
    </div>
  );
}
