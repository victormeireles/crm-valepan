"use server";

import {
  LOST_REASON_NAME_MAX,
  normalizeLostReasonName,
  type LostReasonDTO,
} from "@/lib/lost-reasons";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type CrmClient = ReturnType<typeof crmTables>;
type ProfileRole = "admin" | "comercial" | "gestao" | "operacao";

async function authedCrm(): Promise<
  | { ok: true; crm: CrmClient; userId: string; role: ProfileRole | null }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: profile } = await crm.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { ok: true, crm, userId: user.id, role: profile?.role ?? null };
}

function canManageReasons(role: ProfileRole | null): boolean {
  return role === "admin" || role === "gestao";
}

function mapReason(row: {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}): LostReasonDTO {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    active: row.active,
  };
}

function revalidateReasonSurfaces() {
  revalidatePath("/settings");
  revalidatePath("/pipeline");
  revalidatePath("/leads");
}

export async function listLostReasons(): Promise<
  { ok: true; reasons: LostReasonDTO[]; canManage: boolean } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  const { data, error } = await auth.crm
    .from("lost_reasons")
    .select("id, name, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    reasons: (data ?? []).map(mapReason),
    canManage: canManageReasons(auth.role),
  };
}

export async function createLostReason(input: { name: string }): Promise<
  { ok: true; reason: LostReasonDTO } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar motivos." };

  const name = normalizeLostReasonName(input.name);
  if (!name) return { ok: false, error: "Informe o nome do motivo." };
  if (name.length > LOST_REASON_NAME_MAX) {
    return { ok: false, error: `Use até ${LOST_REASON_NAME_MAX} caracteres.` };
  }

  const { data: last } = await auth.crm
    .from("lost_reasons")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? 0) + 10;

  const { data, error } = await auth.crm
    .from("lost_reasons")
    .insert({ name, sort_order: sortOrder, active: true })
    .select("id, name, sort_order, active")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um motivo com esse nome." };
    return { ok: false, error: error.message };
  }
  revalidateReasonSurfaces();
  return { ok: true, reason: mapReason(data) };
}

export async function updateLostReason(input: {
  id: string;
  name?: string;
  active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar motivos." };

  const { data: current, error: currentError } = await auth.crm
    .from("lost_reasons")
    .select("id, name, active")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Motivo não encontrado." };

  const patch: { name?: string; active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof input.active === "boolean") patch.active = input.active;
  if (typeof input.name === "string") {
    const name = normalizeLostReasonName(input.name);
    if (!name) return { ok: false, error: "Informe o nome do motivo." };
    if (name.length > LOST_REASON_NAME_MAX) {
      return { ok: false, error: `Use até ${LOST_REASON_NAME_MAX} caracteres.` };
    }
    patch.name = name;
  }

  const { error } = await auth.crm.from("lost_reasons").update(patch).eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um motivo com esse nome." };
    return { ok: false, error: error.message };
  }

  if (patch.name && patch.name !== current.name) {
    await auth.crm
      .from("opportunities")
      .update({ lost_reason: patch.name, updated_at: new Date().toISOString() })
      .eq("lost_reason", current.name);
  }

  revalidateReasonSurfaces();
  return { ok: true };
}

export async function moveLostReason(input: {
  id: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar motivos." };

  const { data: rows, error } = await auth.crm
    .from("lost_reasons")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === input.id);
  if (index < 0) return { ok: false, error: "Motivo não encontrado." };
  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return { ok: true };

  const current = list[index]!;
  const neighbor = list[swapWith]!;
  const now = new Date().toISOString();
  const { error: firstError } = await auth.crm
    .from("lost_reasons")
    .update({ sort_order: neighbor.sort_order, updated_at: now })
    .eq("id", current.id);
  if (firstError) return { ok: false, error: firstError.message };
  const { error: secondError } = await auth.crm
    .from("lost_reasons")
    .update({ sort_order: current.sort_order, updated_at: now })
    .eq("id", neighbor.id);
  if (secondError) return { ok: false, error: secondError.message };

  revalidateReasonSurfaces();
  return { ok: true };
}

export async function deleteLostReason(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar motivos." };

  const { data: current, error: currentError } = await auth.crm
    .from("lost_reasons")
    .select("id, name")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Motivo não encontrado." };

  const { count, error: countError } = await auth.crm
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("lost_reason", current.name);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Este motivo já foi usado. Desative em vez de excluir, para preservar o histórico.",
    };
  }

  const { error } = await auth.crm.from("lost_reasons").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateReasonSurfaces();
  return { ok: true };
}
