"use server";

import { revalidatePath } from "next/cache";
import {
  INBOX_MESSAGE_PAGE_SIZE,
  INBOX_MESSAGES_VISIBLE_SINCE,
  loadRecentConversationMessages,
  loadOlderMessagesPage,
} from "@/lib/inbox/load-messages";
import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { isLeadExcludedFromPipeline } from "@/lib/lead-pipeline-exclusion";
import { leadExclusionReasonLabel } from "@/lib/lead-pipeline-exclusion";
import { getWeeklyBreadCount } from "@/lib/lead-signals";
import { logInboxPerformance, timeInboxOperation } from "@/lib/inbox-performance";
import { timelineActivityLabel } from "@/lib/timeline-labels";
import { toFollowUpDTO } from "@/lib/follow-ups";
import type { Database, Json } from "@/lib/database.types";
import type { InboxLeadPanelProps } from "@/app/(dashboard)/inbox/inbox-lead-panel";
import { nestOne } from "@/lib/supabase/nested";
import { isPhoneSearchQuery } from "@/lib/phone-search-query";
import { brazilPhoneSearchVariants } from "@crm/shared/phone";
import { isInboxClassification } from "@/lib/inbox-classifications";
import { applyPipelineStageEntryAutomations } from "@/lib/pipeline-stage-automations";
import { pipelineStageForInboxClassification } from "@/lib/pipeline-stage-for-inbox-classification";
import {
  MAX_WHATSAPP_MEDIA_BYTES,
  storePrivateMedia,
} from "@/lib/media-storage";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { registerZapiLidMapForPhoneDigits } from "@/lib/zapi/phone-exists";
import {
  deleteZapiMessage,
  editZapiTextMessage,
  fetchZapiContacts,
  forwardZapiMessage,
  pinZapiMessage,
  sendZapiAudio,
  sendZapiContact,
  sendZapiDocument,
  sendZapiImage,
  sendZapiText,
  setZapiMessageReaction,
  sendZapiVideo,
} from "@/lib/zapi/send";

export type InboxPhoneSearchRow = {
  id: string;
  phone: string;
  identityName: string;
  companyName: string | null;
  lastAt: string;
};

export type InboxConversationView = {
  conversation: {
    id: string;
    phone: string;
    headerName: string;
    headerCompany: string | null;
    location: string | null;
    avatarUrl: string | null;
    firstName: string;
    lastReadAt: string | null;
    lastDirection: string | null;
    lastSentAt: string | null;
    lastBodyPreview: string | null;
    leadId: string | null;
    leadExcluded: boolean;
  };
  messages: Awaited<ReturnType<typeof loadRecentConversationMessages>>["messages"];
  hasMoreOlder: boolean;
  messagesLoadError?: string;
  leadPanel: InboxLeadPanelProps | null;
};

export type InboxSidebarRefreshRow = {
  id: string;
  kind: "lead" | "group";
  displayName: string;
  phone_e164: string;
  avatarUrl: string | null;
  preview: string;
  lastAt: string;
  leadLine: string;
  awaiting: boolean;
  identityName: string;
  companyName: string | null;
  clientCategory: string | null;
  stageName: string | null;
  weeklyBreadCount: number | null;
  lastDirection: string | null;
  unread: boolean;
  callStatus: "ringing" | "missed_voice" | "missed_video" | null;
};
type InboxSidebarSnapshotRow = Database["crm"]["Functions"]["inbox_sidebar_snapshot"]["Returns"][number];

function inboxPreview(body: string | null) {
  const text = (body ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "Sem mensagem ainda";
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

export async function refreshInboxSidebar(input: {
  tab: "qualify" | "archived" | "groups" | "pipeline";
  page: number;
}) {
  const startedAt = performance.now();
  const supabase = await createServerSupabaseClient();
  const authTimed = await timeInboxOperation("auth_user", supabase.auth.getUser());
  const { data: { user } } = authTimed.value;
  if (!user) {
    logInboxPerformance("sidebar_refresh", performance.now() - startedAt, [authTimed], { tab: input.tab, page: input.page, rows: 0, hasError: true });
    return { ok: false as const, error: "Não autenticado" };
  }
  const crm = crmTables(supabase);
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 1;
  const [snapshotTimed, stagesTimed] = await Promise.all([
    timeInboxOperation("sidebar_snapshot", crm.rpc("inbox_sidebar_snapshot", {
      p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
      p_tab: input.tab,
      p_offset: (page - 1) * 20,
      p_limit: 20,
      p_query: null,
    })),
    timeInboxOperation("pipeline_stages", crm.from("pipeline_stages").select("id, name")),
  ]);
  const snapshotResult = snapshotTimed.value;
  const stagesResult = stagesTimed.value;
  const operations = [authTimed, snapshotTimed, stagesTimed];
  logInboxPerformance("sidebar_refresh", performance.now() - startedAt, operations, {
    tab: input.tab,
    page,
    rows: snapshotResult.data?.length ?? 0,
    hasError: Boolean(snapshotResult.error),
  });
  if (snapshotResult.error) return { ok: false as const, error: snapshotResult.error.message };
  const rows = (snapshotResult.data ?? []) as InboxSidebarSnapshotRow[];
  const meta = rows[0];
  const stageNames = new Map((stagesResult.data ?? []).map((stage) => [stage.id, stage.name]));
  const conversations: InboxSidebarRefreshRow[] = rows
    .filter((row) => row.conversation_id && row.phone_e164 && row.conversation_kind && row.created_at && row.updated_at)
    .map((row) => {
      const group = row.conversation_kind === "group";
      const identityName = group
        ? row.group_display_name?.trim() || row.phone_e164!
        : row.lead_id ? displayPersonName(row.contact_name) : "Sem lead";
      const companyName = group || !row.lead_id ? null : displayCompanyName({
        companyName: row.company_name,
        distributorName: row.distributor_name,
        clientCategory: row.client_category,
      });
      const lastAt = row.last_sent_at ?? row.last_message_at ?? row.updated_at!;
      const lastDirection = row.last_direction;
      const callStatus = row.event_kind === "whatsapp_call" &&
        (row.event_status === "ringing" || row.event_status === "missed_voice" || row.event_status === "missed_video")
        ? row.event_status
        : null;
      return {
        id: row.conversation_id!,
        kind: group ? "group" : "lead",
        displayName: row.contact_name?.trim() || row.phone_e164!,
        phone_e164: row.phone_e164!,
        avatarUrl: validInboxAvatarUrl(row.avatar_url),
        preview: inboxPreview(row.last_body_preview),
        lastAt,
        leadLine: group
          ? "Conversa em grupo"
          : row.excluded_from_pipeline_at
            ? `Arquivado · ${leadExclusionReasonLabel(null)}`
            : input.tab === "pipeline" ? "No funil" : "Para qualificar",
        awaiting: lastDirection === "in",
        identityName,
        companyName,
        clientCategory: row.client_category,
        stageName: row.stage_id ? stageNames.get(row.stage_id) ?? null : null,
        weeklyBreadCount: getWeeklyBreadCount(row.weekly_bread_consumption),
        lastDirection,
        unread: Boolean(row.last_inbound_sent_at && (!row.last_read_at || row.last_inbound_sent_at > row.last_read_at)),
        callStatus,
      };
    });
  return {
    ok: true as const,
    conversations,
    tabCounts: {
      qualify: Number(meta?.qualify_count ?? 0),
      archived: Number(meta?.archived_count ?? 0),
      groups: Number(meta?.groups_count ?? 0),
      pipeline: Number(meta?.pipeline_count ?? 0),
    },
  };
}

const INBOX_TEAM_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

function validInboxAvatarUrl(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text && text !== "null" && text !== "undefined" ? text : null;
}

function compactInboxHistoryItem(row: { kind: string; event_id: string; at: string; data: Json }) {
  const data = (row.data ?? {}) as Record<string, unknown>;
  if (row.kind === "sample") return { id: row.event_id, at: row.at, icon: "inventory_2", label: `Amostra · ${String(data.status ?? "atualizada")}` };
  if (row.kind === "activity") {
    const action = typeof data.action === "string" ? data.action : "activity";
    return { id: row.event_id, at: row.at, icon: action === "stage_changed" ? "conversion_path" : "history", label: timelineActivityLabel(action) };
  }
  if (row.kind === "task") {
    const itemName = data.task_kind === "follow_up" ? "Follow-up" : "Tarefa";
    return { id: row.event_id, at: row.at, icon: "task_alt", label: `${itemName} · ${String(data.title ?? "criado")}` };
  }
  return { id: row.event_id, at: row.at, icon: row.kind === "message" ? "chat" : "history", label: row.kind === "message" ? "Interação no WhatsApp" : "Lead atualizado" };
}

export async function loadInboxConversationView(conversationId: string) {
  const startedAt = performance.now();
  const id = conversationId.trim();
  if (!id) return { ok: false as const, error: "Conversa inválida." };

  const supabase = await createServerSupabaseClient();
  const authTimed = await timeInboxOperation("auth_user", supabase.auth.getUser());
  const { data: { user } } = authTimed.value;
  if (!user) {
    logInboxPerformance("conversation_load", performance.now() - startedAt, [authTimed], { found: false, messages: 0, hasError: true });
    return { ok: false as const, error: "Não autenticado" };
  }
  const crm = crmTables(supabase);
  const messagesPromise = timeInboxOperation("messages_initial", loadRecentConversationMessages(crm, id));
  const [conversationTimed, tailTimed] = await Promise.all([
    timeInboxOperation("selected_conversation", crm.from("conversations").select(`
      id, phone_e164, conversation_kind, group_display_name, last_read_at,
      leads(id, client_category, excluded_from_pipeline_at,
        contacts(full_name, avatar_url),
        companies(name, city, state),
        distributors(name)
      )
    `).eq("id", id).maybeSingle()),
    timeInboxOperation("last_message", crm.from("v_conversation_last_message")
      .select("last_direction, last_sent_at, last_body_preview")
      .eq("conversation_id", id).maybeSingle()),
  ]);
  const messagesTimed = await messagesPromise;
  const conversationResult = conversationTimed.value;
  const tailResult = tailTimed.value;
  const messagesResult = messagesTimed.value;
  logInboxPerformance("conversation_load", performance.now() - startedAt, [authTimed, conversationTimed, tailTimed, messagesTimed], {
    found: Boolean(conversationResult.data),
    messages: messagesResult.messages.length,
    hasError: Boolean(conversationResult.error || messagesResult.error),
  });
  if (conversationResult.error || !conversationResult.data) {
    return { ok: false as const, error: conversationResult.error?.message ?? "Conversa não encontrada." };
  }

  const conversation = conversationResult.data;
  const lead = nestOne(conversation.leads);
  const contact = nestOne(lead?.contacts ?? null);
  const company = nestOne(lead?.companies ?? null);
  const distributor = nestOne(lead?.distributors ?? null);
  const headerName = conversation.conversation_kind === "group"
    ? conversation.group_display_name?.trim() || conversation.phone_e164
    : lead ? displayPersonName(contact?.full_name) : "Sem lead";
  const headerCompany = conversation.conversation_kind === "lead" && lead
    ? displayCompanyName({
        companyName: company?.name,
        distributorName: distributor?.name,
        clientCategory: lead.client_category,
      })
    : null;

  const view: InboxConversationView = {
    conversation: {
      id: conversation.id,
      phone: conversation.phone_e164,
      headerName,
      headerCompany,
      location: [company?.city, company?.state].filter(Boolean).join(", ") || null,
      avatarUrl: validInboxAvatarUrl(contact?.avatar_url),
      firstName: headerName.trim().split(/\s+/)[0] || "cliente",
      lastReadAt: conversation.last_read_at ?? null,
      lastDirection: tailResult.data?.last_direction ?? null,
      lastSentAt: tailResult.data?.last_sent_at ?? null,
      lastBodyPreview: tailResult.data?.last_body_preview ?? null,
      leadId: lead?.id ?? null,
      leadExcluded: isLeadExcludedFromPipeline(lead),
    },
    messages: messagesResult.messages,
    hasMoreOlder: messagesResult.hasMoreOlder,
    ...(messagesResult.error ? { messagesLoadError: messagesResult.error.message } : {}),
    leadPanel: null,
  };
  return { ok: true as const, view };
}

export async function loadInboxLeadPanel(conversationId: string) {
  const startedAt = performance.now();
  const id = conversationId.trim();
  if (!id) return { ok: false as const, error: "Conversa inválida." };
  const supabase = await createServerSupabaseClient();
  const authTimed = await timeInboxOperation("auth_user", supabase.auth.getUser());
  const { data: { user } } = authTimed.value;
  if (!user) {
    logInboxPerformance("lead_panel_load", performance.now() - startedAt, [authTimed], { tasks: 0, history: 0, hasError: true });
    return { ok: false as const, error: "Não autenticado" };
  }
  const crm = crmTables(supabase);
  const [conversationTimed, stagesTimed, profilesTimed] = await Promise.all([
    timeInboxOperation("lead_details", crm.from("conversations").select(`
      id, phone_e164,
      leads(id, owner_id, client_category, zip_code, weekly_bread_consumption,
        bread_type, bread_weight_grams,
        contacts(full_name), companies(name, document, city, state), distributors(name),
        opportunities(id, stage_id, updated_at)
      )
    `).eq("id", id).maybeSingle()),
    timeInboxOperation("pipeline_stages", crm.from("pipeline_stages").select("id, name, sort_order, is_final").order("sort_order")),
    timeInboxOperation("team_profiles", crm.from("profiles").select("id, full_name, role").order("full_name")),
  ]);
  const conversationResult = conversationTimed.value;
  const stagesResult = stagesTimed.value;
  const profilesResult = profilesTimed.value;
  if (conversationResult.error || !conversationResult.data) {
    return { ok: false as const, error: conversationResult.error?.message ?? "Conversa não encontrada." };
  }
  const conversation = conversationResult.data;
  const lead = nestOne(conversation.leads);
  if (!lead?.id) return { ok: true as const, panel: null };
  const contact = nestOne(lead.contacts);
  const company = nestOne(lead.companies);
  const distributor = nestOne(lead.distributors);
  const opportunities = Array.isArray(lead.opportunities) ? lead.opportunities : lead.opportunities ? [lead.opportunities] : [];
  const opportunity = [...opportunities].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const contactName = displayPersonName(contact?.full_name);
  const companyName = company?.name ?? displayCompanyName({ companyName: company?.name, distributorName: distributor?.name, clientCategory: lead.client_category });
  const [tasksTimed, historyTimed] = await Promise.all([
    timeInboxOperation("lead_tasks", crm.from("tasks").select("id, title, due_at, done, assignee_id, task_kind")
      .eq("lead_id", lead.id).order("done").order("due_at", { ascending: true, nullsFirst: false })),
    timeInboxOperation("lead_history", crm.from("timeline_events").select("kind, event_id, at, data")
      .eq("lead_id", lead.id).order("at", { ascending: false }).limit(4)),
  ]);
  const tasksResult = tasksTimed.value;
  const historyResult = historyTimed.value;
  const teamOptions = (profilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    label: `${profile.full_name?.trim() || "Sem nome"} (${INBOX_TEAM_ROLE_LABEL[profile.role] ?? profile.role})`,
  }));
  const tasks = tasksResult.data ?? [];
  const followUp = tasks.find((task) => task.task_kind === "follow_up" && !task.done) ?? null;
  const panel: InboxLeadPanelProps = {
    conversationId: conversation.id,
    leadId: lead.id,
    contactName,
    companyName,
    initialCategory: lead.client_category ?? null,
    initialStageId: opportunity?.stage_id ?? null,
    initialState: company?.state ?? null,
    initialCity: company?.city ?? null,
    initialZipCode: lead.zip_code ?? null,
    initialWeeklyBreadConsumption: lead.weekly_bread_consumption ?? null,
    initialBreadWeightGrams: lead.bread_weight_grams ?? null,
    initialBreadType: lead.bread_type ?? null,
    initialCnpj: company?.document ?? null,
    initialOwnerId: lead.owner_id ?? null,
    stages: (stagesResult.data ?? []).map((stage) => ({ id: stage.id, name: stage.name, sortOrder: stage.sort_order, isFinal: stage.is_final })),
    teamOptions,
    opportunityId: opportunity?.id ?? null,
    followUp: followUp ? toFollowUpDTO(followUp) : null,
    tasks,
    assigneeLabels: Object.fromEntries(teamOptions.map((option) => [option.id, option.label])),
    history: (historyResult.data ?? []).map(compactInboxHistoryItem),
  };
  logInboxPerformance("lead_panel_load", performance.now() - startedAt, [
    authTimed,
    conversationTimed,
    stagesTimed,
    profilesTimed,
    tasksTimed,
    historyTimed,
  ], {
    tasks: tasks.length,
    history: historyResult.data?.length ?? 0,
    hasError: Boolean(tasksResult.error || historyResult.error),
  });
  return { ok: true as const, panel };
}

export async function searchInboxConversationsByPhone(query: string) {
  if (!isPhoneSearchQuery(query)) {
    return { ok: true as const, conversations: [] as InboxPhoneSearchRow[] };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const variants = brazilPhoneSearchVariants(query);

  try {
    const { data, error } = await crm
      .from("conversations")
      .select("id, phone_e164, last_message_at, updated_at, leads!inner(contacts(full_name), companies(name))")
      .eq("conversation_kind", "lead")
      .gte("last_message_at", INBOX_MESSAGES_VISIBLE_SINCE)
      .or(variants.map((digits) => `phone_e164.ilike.%${digits}%`).join(","))
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(40);
    if (error) return { ok: false as const, error: error.message };

    const conversations: InboxPhoneSearchRow[] = (data ?? []).map((row) => {
      const lead = nestOne(row.leads);
      const contact = nestOne(lead?.contacts ?? null);
      const company = nestOne(lead?.companies ?? null);
      return {
        id: row.id,
        phone: row.phone_e164,
        identityName: contact?.full_name?.trim() || row.phone_e164,
        companyName: company?.name?.trim() || null,
        lastAt: row.last_message_at ?? row.updated_at,
      };
    });
    return { ok: true as const, conversations };
  } catch (searchError) {
    return {
      ok: false as const,
      error: searchError instanceof Error ? searchError.message : "Falha ao buscar telefone.",
    };
  }
}

export async function sendConversationMessage(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const replyToMessageId = String(formData.get("reply_to_message_id") ?? "").trim();
  if (!conversationId || !phone || !message) {
    return { ok: false as const, error: "Dados incompletos para envio." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  let replyTo: { id: string; provider_message_id: string | null } | null = null;
  if (replyToMessageId) {
    const { data } = await crm
      .from("messages")
      .select("id, provider_message_id, deleted_at")
      .eq("id", replyToMessageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (!data || data.deleted_at) return { ok: false as const, error: "Mensagem original não encontrada." };
    if (!data.provider_message_id) {
      return { ok: false as const, error: "Esta mensagem antiga não pode ser respondida no WhatsApp." };
    }
    replyTo = data;
  }

  let providerMessageId: string | null = null;
  try {
    const sent = await sendZapiText(phone, message, replyTo?.provider_message_id);
    providerMessageId = sent.providerMessageId;
    if (!phone.toLowerCase().includes("@g.us")) {
      try {
        await registerZapiLidMapForPhoneDigits(phone);
      } catch (e) {
        console.warn("[inbox] registerZapiLidMapForPhoneDigits:", e);
      }
    }
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao enviar mensagem no Z-API.",
    };
  }

  const { data: conv } = await crm
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();

  const { error } = await crm.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    body: message,
    message_status: "sent",
    ...(replyTo ? { reply_to_message_id: replyTo.id } : {}),
    ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
  });
  if (error) return { ok: false as const, error: error.message };

  await crm
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (conv?.lead_id) {
    await crm
      .from("tasks")
      .update({ done: true, updated_at: new Date().toISOString() })
      .eq("lead_id", conv.lead_id)
      .eq("done", false)
      .like("source_key", "whatsapp-call:%");

    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conv.lead_id,
      action: "outbound_whatsapp",
      actor_id: user.id,
      payload: { message },
    });
  }

  revalidatePath("/inbox");
  if (conv?.lead_id) revalidatePath(`/leads/${conv.lead_id}`);
  return { ok: true as const };
}

export async function loadEarlierInboxMessages(
  conversationId: string,
  beforeSentAt: string,
) {
  const cid = conversationId.trim();
  const cursor = beforeSentAt.trim();
  if (!cid || !cursor) {
    return { ok: false as const, error: "Dados incompletos." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { messages, error } = await loadOlderMessagesPage(crm, cid, cursor);
  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    messages,
    hasMoreOlder: messages.length >= INBOX_MESSAGE_PAGE_SIZE,
  };
}

export async function markConversationRead(conversationId: string) {
  const id = conversationId.trim();
  if (!id) return { ok: false as const, error: "Conversa inválida." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const nowIso = new Date().toISOString();
  const { error } = await crm
    .from("conversations")
    .update({
      last_read_at: nowIso,
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
}

const ALLOWED_MESSAGE_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

export async function reactToInboxMessage(input: {
  conversationId: string;
  messageId: string;
  reaction: string | null;
}) {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  const reaction = input.reaction?.trim() || null;
  if (!conversationId || !messageId || (reaction && !ALLOWED_MESSAGE_REACTIONS.has(reaction))) {
    return { ok: false as const, error: "Reação inválida." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id, provider_message_id, deleted_at, conversations!inner(phone_e164)")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!message?.provider_message_id || message.deleted_at) {
    return { ok: false as const, error: "Esta mensagem não possui identificação no WhatsApp." };
  }
  const conversationValue = message.conversations as unknown as
    | { phone_e164: string }
    | { phone_e164: string }[];
  const phone = Array.isArray(conversationValue)
    ? conversationValue[0]?.phone_e164
    : conversationValue?.phone_e164;
  if (!phone) return { ok: false as const, error: "Conversa não encontrada." };

  try {
    await setZapiMessageReaction({ phone, messageId: message.provider_message_id, reaction });
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha ao reagir no WhatsApp.",
    };
  }
  const { error } = await crm.from("messages").update({ reaction }).eq("id", messageId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function addInboxMessageToNotes(input: {
  conversationId: string;
  messageId: string;
}) {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  if (!conversationId || !messageId) return { ok: false as const, error: "Mensagem inválida." };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: conversation } = await crm
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.lead_id) return { ok: false as const, error: "Conversa sem lead vinculado." };
  const { data: message } = await crm
    .from("messages")
    .select("body, direction, sent_at, media_file_name")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!message) return { ok: false as const, error: "Mensagem não encontrada." };
  const { data: opportunity } = await crm
    .from("opportunities")
    .select("id")
    .eq("lead_id", conversation.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const content = message.body?.trim() || message.media_file_name?.trim() || "Mensagem sem texto";
  const body = [
    "Mensagem do WhatsApp adicionada pelo Inbox",
    `Data: ${new Date(message.sent_at).toLocaleString("pt-BR")}`,
    `Origem: ${message.direction === "out" ? "Equipe comercial" : "Cliente"}`,
    "",
    content,
  ].join("\n");
  const { error } = await crm.from("notes").insert({
    lead_id: conversation.lead_id,
    opportunity_id: opportunity?.id ?? null,
    author_id: user.id,
    body,
  });
  if (error) return { ok: false as const, error: error.message };
  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: conversation.lead_id,
    action: "message_added_to_notes",
    actor_id: user.id,
    payload: { message_id: messageId, preview: content.slice(0, 200) },
  });
  revalidatePath(`/leads/${conversation.lead_id}`);
  return { ok: true as const };
}

export async function listInboxForwardTargets(conversationId: string) {
  const currentId = conversationId.trim();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data, error } = await crm
    .from("conversations")
    .select("id, phone_e164, group_display_name, conversation_kind")
    .neq("id", currentId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false as const, error: error.message };
  return {
    ok: true as const,
    targets: (data ?? []).map((item) => ({
      conversationId: item.id,
      phone: item.phone_e164,
      label: item.group_display_name?.trim() || item.phone_e164,
      isGroup: item.conversation_kind === "group",
    })),
  };
}

export async function forwardInboxMessage(input: {
  conversationId: string;
  messageId: string;
  targetConversationId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: sourceMessage } = await crm
    .from("messages")
    .select("provider_message_id, deleted_at, conversations!inner(phone_e164)")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .maybeSingle();
  const { data: target } = await crm
    .from("conversations")
    .select("phone_e164, lead_id")
    .eq("id", input.targetConversationId.trim())
    .maybeSingle();
  if (!sourceMessage?.provider_message_id || sourceMessage.deleted_at || !target?.phone_e164) {
    return { ok: false as const, error: "Mensagem ou destino não encontrado." };
  }
  const sourceValue = sourceMessage.conversations as unknown as
    | { phone_e164: string }
    | { phone_e164: string }[];
  const sourcePhone = Array.isArray(sourceValue)
    ? sourceValue[0]?.phone_e164
    : sourceValue?.phone_e164;
  if (!sourcePhone) return { ok: false as const, error: "Conversa de origem não encontrada." };
  try {
    await forwardZapiMessage({
      sourcePhone,
      targetPhone: target.phone_e164,
      messageId: sourceMessage.provider_message_id,
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao encaminhar." };
  }
  if (target.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: target.lead_id,
      action: "whatsapp_message_forwarded",
      actor_id: user.id,
      payload: { source_message_id: input.messageId },
    });
  }
  return { ok: true as const };
}

export async function editInboxMessage(input: {
  conversationId: string;
  messageId: string;
  body: string;
}) {
  const body = input.body.trim();
  if (!body) return { ok: false as const, error: "A mensagem não pode ficar vazia." };
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id, direction, provider_message_id, media_kind, deleted_at, conversations!inner(phone_e164, lead_id)")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .maybeSingle();
  if (!message || message.direction !== "out" || !message.provider_message_id || message.media_kind || message.deleted_at) {
    return { ok: false as const, error: "Esta mensagem não pode ser editada." };
  }
  const conversationValue = message.conversations as unknown as
    | { phone_e164: string; lead_id: string | null }
    | { phone_e164: string; lead_id: string | null }[];
  const conversation = Array.isArray(conversationValue) ? conversationValue[0] : conversationValue;
  try {
    await editZapiTextMessage({ phone: conversation.phone_e164, messageId: message.provider_message_id, message: body });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao editar." };
  }
  const editedAt = new Date().toISOString();
  const { error } = await crm.from("messages").update({ body, edited_at: editedAt }).eq("id", message.id);
  if (error) return { ok: false as const, error: error.message };
  if (conversation.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conversation.lead_id,
      action: "whatsapp_message_edited",
      actor_id: user.id,
      payload: { message_id: message.id },
    });
  }
  return { ok: true as const };
}

export async function deleteInboxMessage(input: {
  conversationId: string;
  messageId: string;
  deleteFromWhatsapp: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id, direction, provider_message_id, deleted_at, conversations!inner(phone_e164, lead_id)")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .maybeSingle();
  if (!message || message.deleted_at) return { ok: false as const, error: "Mensagem não encontrada." };
  const conversationValue = message.conversations as unknown as
    | { phone_e164: string; lead_id: string | null }
    | { phone_e164: string; lead_id: string | null }[];
  const conversation = Array.isArray(conversationValue) ? conversationValue[0] : conversationValue;
  if (input.deleteFromWhatsapp) {
    if (!message.provider_message_id) {
      return { ok: false as const, error: "Esta mensagem antiga só pode ser apagada no CRM." };
    }
    try {
      await deleteZapiMessage({
        phone: conversation.phone_e164,
        messageId: message.provider_message_id,
        owner: message.direction === "out",
      });
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao apagar no WhatsApp." };
    }
  }
  const deletedAt = new Date().toISOString();
  const { error } = await crm
    .from("messages")
    .update({ deleted_at: deletedAt, deleted_by: user.id, reaction: null })
    .eq("id", message.id);
  if (error) return { ok: false as const, error: error.message };
  if (conversation.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conversation.lead_id,
      action: "whatsapp_message_deleted",
      actor_id: user.id,
      payload: { message_id: message.id, deleted_from_whatsapp: input.deleteFromWhatsapp },
    });
  }
  return { ok: true as const };
}

export async function toggleInboxMessageFavorite(input: {
  conversationId: string;
  messageId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (!message) return { ok: false as const, error: "Mensagem não encontrada." };
  const { data: favorite } = await crm
    .from("message_favorites")
    .select("message_id")
    .eq("message_id", message.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (favorite) {
    const { error } = await crm.from("message_favorites").delete().eq("message_id", message.id).eq("user_id", user.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, favorite: false };
  }
  const { error } = await crm.from("message_favorites").insert({ message_id: message.id, user_id: user.id });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, favorite: true };
}

export async function setInboxMessagePinned(input: {
  conversationId: string;
  messageId: string;
  pinned: boolean;
  duration?: "24_hours" | "7_days" | "30_days";
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id, provider_message_id, deleted_at, conversations!inner(phone_e164, lead_id)")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .maybeSingle();
  if (!message?.provider_message_id || message.deleted_at) {
    return { ok: false as const, error: "Esta mensagem não pode ser fixada." };
  }
  const conversationValue = message.conversations as unknown as
    | { phone_e164: string; lead_id: string | null }
    | { phone_e164: string; lead_id: string | null }[];
  const conversation = Array.isArray(conversationValue) ? conversationValue[0] : conversationValue;
  const duration = input.duration ?? "7_days";
  try {
    await pinZapiMessage({
      phone: conversation.phone_e164,
      messageId: message.provider_message_id,
      action: input.pinned ? "pin" : "unpin",
      duration,
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao fixar mensagem." };
  }
  const pinnedAt = input.pinned ? new Date() : null;
  const durationDays = duration === "24_hours" ? 1 : duration === "30_days" ? 30 : 7;
  const pinnedUntil = pinnedAt
    ? new Date(pinnedAt.getTime() + durationDays * 86_400_000).toISOString()
    : null;
  const { error } = await crm.from("messages").update({
    pinned_at: pinnedAt?.toISOString() ?? null,
    pinned_until: pinnedUntil,
  }).eq("id", message.id);
  if (error) return { ok: false as const, error: error.message };
  if (conversation.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conversation.lead_id,
      action: input.pinned ? "whatsapp_message_pinned" : "whatsapp_message_unpinned",
      actor_id: user.id,
      payload: { message_id: message.id, duration: input.pinned ? duration : null },
    });
  }
  return { ok: true as const };
}

export async function createCommercialBroadcast(input: {
  conversationId: string;
  messageId: string;
  targetConversationIds: string[];
}) {
  const targetIds = [...new Set(input.targetConversationIds.map((id) => id.trim()).filter(Boolean))];
  if (targetIds.length === 0 || targetIds.length > 20) {
    return { ok: false as const, error: "Selecione entre 1 e 20 conversas." };
  }
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: source } = await crm
    .from("messages")
    .select("provider_message_id, deleted_at, conversations!inner(phone_e164)")
    .eq("id", input.messageId.trim())
    .eq("conversation_id", input.conversationId.trim())
    .maybeSingle();
  if (!source?.provider_message_id || source.deleted_at) {
    return { ok: false as const, error: "Mensagem de origem indisponível." };
  }
  const sourceValue = source.conversations as unknown as { phone_e164: string } | { phone_e164: string }[];
  const sourcePhone = Array.isArray(sourceValue) ? sourceValue[0]?.phone_e164 : sourceValue?.phone_e164;
  const { data: targets, error: targetsError } = await crm
    .from("conversations")
    .select("id, phone_e164, lead_id")
    .in("id", targetIds);
  if (targetsError || !sourcePhone) return { ok: false as const, error: targetsError?.message ?? "Origem não encontrada." };

  let sent = 0;
  const failed: string[] = [];
  for (const target of targets ?? []) {
    try {
      await forwardZapiMessage({ sourcePhone, targetPhone: target.phone_e164, messageId: source.provider_message_id });
      sent += 1;
      if (target.lead_id) {
        await crm.from("activity_logs").insert({
          entity_type: "lead",
          entity_id: target.lead_id,
          action: "commercial_broadcast_sent",
          actor_id: user.id,
          payload: { source_message_id: input.messageId },
        });
      }
    } catch {
      failed.push(target.id);
    }
  }
  return { ok: sent > 0 as boolean, sent, failed, error: sent === 0 ? "Não foi possível enviar a transmissão." : undefined };
}

export async function updateConversationClassification(input: {
  conversationId: string;
  classification: string | null;
}) {
  const conversationId = input.conversationId.trim();
  if (!conversationId) {
    return { ok: false as const, error: "Conversa inválida." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  const raw = input.classification?.trim() ?? "";
  const normalized = raw.toUpperCase();
  const classification = normalized.length > 0 ? normalized : null;
  if (classification && !isInboxClassification(classification)) {
    return { ok: false as const, error: "Classificação inválida." };
  }

  const { data: conversation, error: conversationError } = await crm
    .from("conversations")
    .select("id, lead_id, phone_e164")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError) return { ok: false as const, error: conversationError.message };
  if (!conversation) return { ok: false as const, error: "Conversa não encontrada." };

  const targetStageName = pipelineStageForInboxClassification(classification);
  let targetStageId: string | null = null;
  if (targetStageName && conversation.lead_id) {
    const { data: stage, error: stageError } = await crm
      .from("pipeline_stages")
      .select("id")
      .ilike("name", targetStageName)
      .limit(1)
      .maybeSingle();
    if (stageError) return { ok: false as const, error: stageError.message };
    if (!stage?.id) {
      return {
        ok: false as const,
        error: `A etapa ${targetStageName} não foi encontrada no funil.`,
      };
    }
    targetStageId = stage.id;
  }

  // A mudanca de classificacao aciona um trigger que tira o lead da etapa de
  // entrada. O responsavel precisa ser definido antes disso; caso contrario,
  // um usuario comercial perde a permissao de ler o proprio lead no meio da
  // Server Action e a renderizacao seguinte falha.
  if (targetStageId && conversation.lead_id) {
    const { error: claimLeadError } = await crm
      .from("leads")
      .update({ owner_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", conversation.lead_id)
      .is("owner_id", null);
    if (claimLeadError) return { ok: false as const, error: claimLeadError.message };
  }

  const { data: updated, error } = await crm
    .from("conversations")
    .update({
      classification,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível salvar a classificação." };

  if (targetStageId && conversation.lead_id) {
    const nowIso = new Date().toISOString();
    const { data: opportunity, error: opportunityError } = await crm
      .from("opportunities")
      .select("id, stage_id, owner_id")
      .eq("lead_id", conversation.lead_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opportunityError) return { ok: false as const, error: opportunityError.message };

    let opportunityId = opportunity?.id ?? null;
    if (opportunityId) {
      const { error: moveError } = await crm
        .from("opportunities")
        .update({
          stage_id: targetStageId,
          owner_id: opportunity?.owner_id ?? user.id,
          updated_at: nowIso,
        })
        .eq("lead_id", conversation.lead_id);
      if (moveError) return { ok: false as const, error: moveError.message };
    } else {
      const { data: inserted, error: insertError } = await crm
        .from("opportunities")
        .insert({
          lead_id: conversation.lead_id,
          owner_id: user.id,
          stage_id: targetStageId,
          title: `Oportunidade ${conversation.phone_e164}`,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        return { ok: false as const, error: insertError?.message ?? "Erro ao criar oportunidade." };
      }
      opportunityId = inserted.id;
    }

    const automation = await applyPipelineStageEntryAutomations(crm, {
      opportunityId,
      leadId: conversation.lead_id,
      stageId: targetStageId,
      previousStageId: opportunity?.stage_id ?? null,
      assigneeId: opportunity?.owner_id ?? user.id,
      actorId: user.id,
    });
    if (automation.created > 0) revalidatePath("/tasks");
  }

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  return { ok: true as const };
}

export async function updateConversationContactName(input: {
  conversationId: string;
  contactName: string;
}) {
  const conversationId = input.conversationId.trim();
  const contactName = input.contactName.trim();
  if (!conversationId) return { ok: false as const, error: "Conversa inválida." };
  if (!contactName) return { ok: false as const, error: "Informe o nome do contato." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  const { data: conv } = await crm
    .from("conversations")
    .select("id, lead_id, phone_e164")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.lead_id) {
    return { ok: false as const, error: "Conversa sem lead vinculado." };
  }

  const { data: lead } = await crm
    .from("leads")
    .select("id, contact_id")
    .eq("id", conv.lead_id)
    .maybeSingle();
  if (!lead?.id) return { ok: false as const, error: "Lead não encontrado." };

  let contactId = lead.contact_id;
  if (contactId) {
    const { error: contactError } = await crm
      .from("contacts")
      .update({
        full_name: contactName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
    if (contactError) return { ok: false as const, error: contactError.message };
  } else {
    const { data: inserted, error: insertError } = await crm
      .from("contacts")
      .insert({
        full_name: contactName,
        phone_e164: conv.phone_e164,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      return { ok: false as const, error: insertError?.message ?? "Erro ao criar contato." };
    }
    contactId = inserted.id;
    const { error: leadUpdateError } = await crm
      .from("leads")
      .update({
        contact_id: contactId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (leadUpdateError) return { ok: false as const, error: leadUpdateError.message };
  }

  revalidatePath("/inbox");
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  return { ok: true as const };
}

export async function listWhatsappContacts() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  try {
    const contacts = await fetchZapiContacts(1, 300);
    return { ok: true as const, contacts };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao listar contatos do WhatsApp.",
    };
  }
}

export async function sendConversationContactCard(input: {
  conversationId: string;
  phone: string;
  contactName: string;
  contactPhone: string;
}) {
  const conversationId = input.conversationId.trim();
  const phone = input.phone.trim();
  const contactName = input.contactName.trim();
  const contactPhone = input.contactPhone.trim();
  if (!conversationId || !phone || !contactName || !contactPhone) {
    return { ok: false as const, error: "Dados incompletos para enviar contato." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  let providerMessageId: string | null = null;
  try {
    const sent = await sendZapiContact(phone, contactName, contactPhone);
    providerMessageId = sent.providerMessageId;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao enviar contato no Z-API.",
    };
  }

  const { data: conv } = await crm
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();

  const body = `[Contato enviado] ${contactName} · ${contactPhone}`;
  const { error } = await crm.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    body,
    message_status: "sent",
    ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
  });
  if (error) return { ok: false as const, error: error.message };

  await crm
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (conv?.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conv.lead_id,
      action: "outbound_whatsapp_contact",
      actor_id: user.id,
      payload: { contact_name: contactName, contact_phone: contactPhone },
    });
  }

  revalidatePath("/inbox");
  if (conv?.lead_id) revalidatePath(`/leads/${conv.lead_id}`);
  return { ok: true as const };
}

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then((buf) => {
    const base64 = Buffer.from(buf).toString("base64");
    const mime = file.type?.trim() || "application/octet-stream";
    return `data:${mime};base64,${base64}`;
  });
}

export async function sendConversationAttachment(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const mode = String(formData.get("attachment_mode") ?? "").trim().toLowerCase();
  const file = formData.get("attachment");
  if (!conversationId || !phone || (mode !== "document" && mode !== "media")) {
    return { ok: false as const, error: "Dados incompletos para envio do anexo." };
  }
  if (!(file instanceof File) || !file.size) {
    return { ok: false as const, error: "Selecione um arquivo para enviar." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  if (file.size > MAX_WHATSAPP_MEDIA_BYTES) {
    return {
      ok: false as const,
      error: "O WhatsApp aceita arquivos de até 100 MB neste canal.",
    };
  }

  const mime = file.type.toLowerCase();
  const dataUrl = await fileToDataUrl(file);
  let providerMessageId: string | null = null;
  let kindLabel = "arquivo";
  try {
    if (mode === "document") {
      const sent = await sendZapiDocument(phone, dataUrl, file.name);
      providerMessageId = sent.providerMessageId;
      kindLabel = "documento";
    } else if (mime.startsWith("video/")) {
      const sent = await sendZapiVideo(phone, dataUrl, "");
      providerMessageId = sent.providerMessageId;
      kindLabel = "vídeo";
    } else if (mime.startsWith("audio/")) {
      const sent = await sendZapiAudio(phone, dataUrl);
      providerMessageId = sent.providerMessageId;
      kindLabel = "áudio";
    } else {
      const sent = await sendZapiImage(phone, dataUrl, "");
      providerMessageId = sent.providerMessageId;
      kindLabel = "foto";
    }
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao enviar anexo no Z-API.",
    };
  }

  const { data: conv } = await crm
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();

  const body = `[${kindLabel.toUpperCase()} enviado] ${file.name || "arquivo"}`;
  const messageId = crypto.randomUUID();
  const shouldStorePrivately = mime.startsWith("audio/") || mode === "document";
  let storedMedia:
    | { path: string; sizeBytes: number }
    | null = null;
  if (shouldStorePrivately) {
    try {
      storedMedia = await storePrivateMedia({
        messageId,
        kind: mode === "document" ? "document" : "audio",
        bytes: await file.arrayBuffer(),
        mimeType: file.type,
        fileName: file.name,
      });
    } catch (storageError) {
      console.error(
        "[inbox] private attachment storage:",
        storageError instanceof Error ? storageError.message : String(storageError),
      );
    }
  }
  const { error } = await crm.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    direction: "out",
    body,
    message_status: "sent",
    media_kind:
      kindLabel === "foto"
        ? "image"
        : kindLabel === "vídeo"
          ? "video"
          : kindLabel === "áudio"
            ? "audio"
            : "document",
    media_url: storedMedia ? null : dataUrl,
    media_mime_type: file.type || null,
    media_file_name: file.name || null,
    ...(shouldStorePrivately
      ? storedMedia
        ? {
            media_storage_path: storedMedia.path,
            media_size_bytes: storedMedia.sizeBytes,
            media_storage_status: "stored" as const,
          }
        : { media_storage_status: "failed" as const }
      : {}),
    ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
  });
  if (error) return { ok: false as const, error: error.message };

  await crm
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (conv?.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: conv.lead_id,
      action: "outbound_whatsapp_attachment",
      actor_id: user.id,
      payload: { file_name: file.name, mime_type: file.type, file_size: file.size, mode },
    });
  }

  revalidatePath("/inbox");
  if (conv?.lead_id) revalidatePath(`/leads/${conv.lead_id}`);
  return { ok: true as const };
}
