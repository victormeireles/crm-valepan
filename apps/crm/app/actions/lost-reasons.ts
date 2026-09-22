"use server";

import {
  canonicalPipelineStageKey,
  type CanonicalPipelineStageName,
} from "@/lib/pipeline-canonical-stages";
import {
  isPipelineSubstageStageKey,
  normalizeSubstageName,
  SUBSTAGE_NAME_MAX,
  type PipelineSubstageDTO,
} from "@/lib/pipeline-substages";
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

function mapSubstage(row: {
  id: string;
  name: string;
  stage_key: string;
  sort_order: number;
  active: boolean;
}): PipelineSubstageDTO {
  return {
    id: row.id,
    name: row.name,
    stage_key: canonicalPipelineStageKey(row.stage_key) as CanonicalPipelineStageName,
    sort_order: row.sort_order,
    active: row.active,
  };
}

function revalidateReasonSurfaces() {
  revalidatePath("/settings");
  revalidatePath("/settings/subetapas");
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/inbox");
}

export async function listPipelineSubstages(): Promise<
  { ok: true; substages: PipelineSubstageDTO[]; canManage: boolean } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  const { data, error } = await auth.crm
    .from("lost_reasons")
    .select("id, name, stage_key, sort_order, active")
    .order("stage_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    substages: (data ?? []).map(mapSubstage),
    canManage: canManageReasons(auth.role),
  };
}

export async function listLostReasons(): Promise<
  { ok: true; reasons: PipelineSubstageDTO[]; canManage: boolean } | { ok: false; error: string }
> {
  const listed = await listPipelineSubstages();
  if (!listed.ok) return listed;
  return {
    ok: true,
    reasons: listed.substages.filter((item) => item.stage_key === "PERDIDO"),
    canManage: listed.canManage,
  };
}

export async function createPipelineSubstage(input: {
  name: string;
  stageKey: string;
}): Promise<{ ok: true; substage: PipelineSubstageDTO } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar subetapas." };

  const stageKey = canonicalPipelineStageKey(input.stageKey);
  if (!isPipelineSubstageStageKey(stageKey)) {
    return { ok: false, error: "Etapa inválida." };
  }

  const name = normalizeSubstageName(input.name);
  if (!name) return { ok: false, error: "Informe o nome do status." };
  if (name.length > SUBSTAGE_NAME_MAX) {
    return { ok: false, error: `Use até ${SUBSTAGE_NAME_MAX} caracteres.` };
  }

  const { data: last } = await auth.crm
    .from("lost_reasons")
    .select("sort_order")
    .eq("stage_key", stageKey)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? 0) + 10;

  const { data, error } = await auth.crm
    .from("lost_reasons")
    .insert({ name, stage_key: stageKey, sort_order: sortOrder, active: true })
    .select("id, name, stage_key, sort_order, active")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um status com esse nome nesta etapa." };
    return { ok: false, error: error.message };
  }
  revalidateReasonSurfaces();
  return { ok: true, substage: mapSubstage(data) };
}

export async function createLostReason(input: { name: string }) {
  const result = await createPipelineSubstage({ name: input.name, stageKey: "PERDIDO" });
  if (!result.ok) return result;
  return { ok: true as const, reason: result.substage };
}

export async function updatePipelineSubstage(input: {
  id: string;
  name?: string;
  active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar subetapas." };

  const { data: current, error: currentError } = await auth.crm
    .from("lost_reasons")
    .select("id, name, stage_key, active")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Status não encontrado." };

  const patch: { name?: string; active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof input.active === "boolean") patch.active = input.active;
  if (typeof input.name === "string") {
    const name = normalizeSubstageName(input.name);
    if (!name) return { ok: false, error: "Informe o nome do status." };
    if (name.length > SUBSTAGE_NAME_MAX) {
      return { ok: false, error: `Use até ${SUBSTAGE_NAME_MAX} caracteres.` };
    }
    patch.name = name;
  }

  const { error } = await auth.crm.from("lost_reasons").update(patch).eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um status com esse nome nesta etapa." };
    return { ok: false, error: error.message };
  }

  if (patch.name && patch.name !== current.name) {
    const { data: stages } = await auth.crm
      .from("pipeline_stages")
      .select("id, name");
    const stageIds = (stages ?? [])
      .filter((stage) => canonicalPipelineStageKey(stage.name) === canonicalPipelineStageKey(current.stage_key))
      .map((stage) => stage.id);
    if (stageIds.length > 0) {
      await auth.crm
        .from("opportunities")
        .update({ lost_reason: patch.name, updated_at: new Date().toISOString() })
        .eq("lost_reason", current.name)
        .in("stage_id", stageIds);
    }
  }

  revalidateReasonSurfaces();
  return { ok: true };
}

export async function updateLostReason(input: {
  id: string;
  name?: string;
  active?: boolean;
}) {
  return updatePipelineSubstage(input);
}

export async function movePipelineSubstage(input: {
  id: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar subetapas." };

  const { data: current, error: currentError } = await auth.crm
    .from("lost_reasons")
    .select("id, stage_key")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Status não encontrado." };

  const { data: rows, error } = await auth.crm
    .from("lost_reasons")
    .select("id, sort_order")
    .eq("stage_key", current.stage_key)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === input.id);
  if (index < 0) return { ok: false, error: "Status não encontrado." };
  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return { ok: true };

  const currentRow = list[index]!;
  const neighbor = list[swapWith]!;
  const now = new Date().toISOString();
  const { error: firstError } = await auth.crm
    .from("lost_reasons")
    .update({ sort_order: neighbor.sort_order, updated_at: now })
    .eq("id", currentRow.id);
  if (firstError) return { ok: false, error: firstError.message };
  const { error: secondError } = await auth.crm
    .from("lost_reasons")
    .update({ sort_order: currentRow.sort_order, updated_at: now })
    .eq("id", neighbor.id);
  if (secondError) return { ok: false, error: secondError.message };

  revalidateReasonSurfaces();
  return { ok: true };
}

export async function moveLostReason(input: {
  id: string;
  direction: "up" | "down";
}) {
  return movePipelineSubstage(input);
}

export async function deletePipelineSubstage(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageReasons(auth.role)) return { ok: false, error: "Sem permissão para alterar subetapas." };

  const { data: current, error: currentError } = await auth.crm
    .from("lost_reasons")
    .select("id, name, stage_key")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Status não encontrado." };

  const { count, error: countError } = await auth.crm
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("lost_reason", current.name);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Este status já foi usado. Desative em vez de excluir, para preservar o histórico.",
    };
  }

  const { error } = await auth.crm.from("lost_reasons").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateReasonSurfaces();
  return { ok: true };
}

export async function deleteLostReason(input: { id: string }) {
  return deletePipelineSubstage(input);
}
