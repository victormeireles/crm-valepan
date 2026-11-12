"use server";

import {
  MESSAGE_TEMPLATE_BODY_MAX,
  MESSAGE_TEMPLATE_TITLE_MAX,
  normalizeMessageTemplateBody,
  normalizeMessageTemplateTitle,
  type MessageTemplateDTO,
} from "@/lib/inbox/quick-replies";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type CrmClient = ReturnType<typeof crmTables>;
type ProfileRole = "admin" | "comercial" | "gestao" | "operacao";

async function authedCrm(): Promise<
  | { ok: true; crm: CrmClient; role: ProfileRole | null }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: profile } = await crm.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { ok: true, crm, role: profile?.role ?? null };
}

function canManageTemplates(role: ProfileRole | null): boolean {
  return role === "admin" || role === "gestao";
}

function mapTemplate(row: {
  id: string;
  title: string;
  body: string;
  sort_order: number;
  active: boolean;
}): MessageTemplateDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sort_order: row.sort_order,
    active: row.active,
  };
}

function revalidateTemplateSurfaces() {
  revalidatePath("/settings/respostas-rapidas");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
}

export async function listMessageTemplates(): Promise<
  { ok: true; templates: MessageTemplateDTO[]; canManage: boolean } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  const { data, error } = await auth.crm
    .from("message_templates")
    .select("id, title, body, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    templates: (data ?? []).map(mapTemplate),
    canManage: canManageTemplates(auth.role),
  };
}

export async function listActiveQuickReplies(): Promise<
  { ok: true; templates: MessageTemplateDTO[] } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  const { data, error } = await auth.crm
    .from("message_templates")
    .select("id, title, body, sort_order, active")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, templates: (data ?? []).map(mapTemplate) };
}

export async function createMessageTemplate(input: {
  title: string;
  body: string;
}): Promise<{ ok: true; template: MessageTemplateDTO } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageTemplates(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar respostas rápidas." };
  }

  const title = normalizeMessageTemplateTitle(input.title);
  const body = normalizeMessageTemplateBody(input.body);
  if (!title) return { ok: false, error: "Informe o título." };
  if (!body) return { ok: false, error: "Informe o texto da mensagem." };
  if (title.length > MESSAGE_TEMPLATE_TITLE_MAX) {
    return { ok: false, error: `Use até ${MESSAGE_TEMPLATE_TITLE_MAX} caracteres no título.` };
  }
  if (body.length > MESSAGE_TEMPLATE_BODY_MAX) {
    return { ok: false, error: `Use até ${MESSAGE_TEMPLATE_BODY_MAX} caracteres no texto.` };
  }

  const { data: last } = await auth.crm
    .from("message_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? 0) + 10;

  const { data, error } = await auth.crm
    .from("message_templates")
    .insert({ title, body, sort_order: sortOrder, active: true })
    .select("id, title, body, sort_order, active")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "Já existe uma resposta rápida com esse título." };
    }
    return { ok: false, error: error?.message ?? "Erro ao salvar resposta rápida." };
  }

  revalidateTemplateSurfaces();
  return { ok: true, template: mapTemplate(data) };
}

export async function updateMessageTemplate(input: {
  id: string;
  title?: string;
  body?: string;
  active?: boolean;
}): Promise<{ ok: true; template: MessageTemplateDTO } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageTemplates(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar respostas rápidas." };
  }

  const id = input.id.trim();
  if (!id) return { ok: false, error: "Resposta rápida inválida." };

  const patch: {
    title?: string;
    body?: string;
    active?: boolean;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) {
    const title = normalizeMessageTemplateTitle(input.title);
    if (!title) return { ok: false, error: "Informe o título." };
    if (title.length > MESSAGE_TEMPLATE_TITLE_MAX) {
      return { ok: false, error: `Use até ${MESSAGE_TEMPLATE_TITLE_MAX} caracteres no título.` };
    }
    patch.title = title;
  }

  if (input.body !== undefined) {
    const body = normalizeMessageTemplateBody(input.body);
    if (!body) return { ok: false, error: "Informe o texto da mensagem." };
    if (body.length > MESSAGE_TEMPLATE_BODY_MAX) {
      return { ok: false, error: `Use até ${MESSAGE_TEMPLATE_BODY_MAX} caracteres no texto.` };
    }
    patch.body = body;
  }

  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await auth.crm
    .from("message_templates")
    .update(patch)
    .eq("id", id)
    .select("id, title, body, sort_order, active")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Já existe uma resposta rápida com esse título." };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Resposta rápida não encontrada." };

  revalidateTemplateSurfaces();
  return { ok: true, template: mapTemplate(data) };
}

export async function moveMessageTemplate(input: {
  id: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageTemplates(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar respostas rápidas." };
  }

  const { data: rows, error } = await auth.crm
    .from("message_templates")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === input.id);
  if (index < 0) return { ok: false, error: "Resposta rápida não encontrada." };
  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return { ok: true };

  const currentRow = list[index]!;
  const neighbor = list[swapWith]!;
  const now = new Date().toISOString();
  const { error: firstError } = await auth.crm
    .from("message_templates")
    .update({ sort_order: neighbor.sort_order, updated_at: now })
    .eq("id", currentRow.id);
  if (firstError) return { ok: false, error: firstError.message };
  const { error: secondError } = await auth.crm
    .from("message_templates")
    .update({ sort_order: currentRow.sort_order, updated_at: now })
    .eq("id", neighbor.id);
  if (secondError) return { ok: false, error: secondError.message };

  revalidateTemplateSurfaces();
  return { ok: true };
}

export async function deleteMessageTemplate(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageTemplates(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar respostas rápidas." };
  }

  const id = input.id.trim();
  if (!id) return { ok: false, error: "Resposta rápida inválida." };

  const { error } = await auth.crm.from("message_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateTemplateSurfaces();
  return { ok: true };
}
