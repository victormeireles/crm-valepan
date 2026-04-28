"use server";

import { revalidatePath } from "next/cache";
import {
  INBOX_MESSAGE_PAGE_SIZE,
  loadOlderMessagesPage,
} from "@/lib/inbox/load-messages";
import { isInboxClassification } from "@/lib/inbox-classifications";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { registerZapiLidMapForPhoneDigits } from "@/lib/zapi/phone-exists";
import {
  fetchZapiContacts,
  sendZapiContact,
  sendZapiDocument,
  sendZapiImage,
  sendZapiText,
  sendZapiVideo,
} from "@/lib/zapi/send";

export async function sendConversationMessage(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!conversationId || !phone || !message) {
    return { ok: false as const, error: "Dados incompletos para envio." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);

  let providerMessageId: string | null = null;
  try {
    const sent = await sendZapiText(phone, message);
    providerMessageId = sent.providerMessageId;
    try {
      await registerZapiLidMapForPhoneDigits(phone);
    } catch (e) {
      console.warn("[inbox] registerZapiLidMapForPhoneDigits:", e);
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

  revalidatePath("/inbox");
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

  if (file.size > 16 * 1024 * 1024) {
    return { ok: false as const, error: "Arquivo muito grande (máximo 16MB)." };
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
  const { error } = await crm.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    body,
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
