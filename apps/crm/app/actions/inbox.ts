"use server";

import { revalidatePath } from "next/cache";
import {
  INBOX_MESSAGE_PAGE_SIZE,
  loadOlderMessagesPage,
} from "@/lib/inbox/load-messages";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { registerZapiLidMapForPhoneDigits } from "@/lib/zapi/phone-exists";
import { sendZapiText } from "@/lib/zapi/send";

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
