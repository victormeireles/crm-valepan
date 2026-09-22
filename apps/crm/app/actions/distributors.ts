"use server";

import {
  DISTRIBUTOR_NAME_MAX,
  isPlaceholderDistributorName,
  normalizeDistributorName,
  PLACEHOLDER_DISTRIBUTOR_PREFIX,
  type DistributorDTO,
} from "@/lib/distributors";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type CrmClient = ReturnType<typeof crmTables>;
type ProfileRole = "admin" | "comercial" | "gestao" | "operacao";

function canManageDistributors(role: ProfileRole | null): boolean {
  return role === "admin" || role === "gestao";
}

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

function normalizeState(value: string | null | undefined): string | null {
  const state = (value ?? "").trim().toUpperCase();
  return state ? state.slice(0, 2) : null;
}

function normalizeCity(value: string | null | undefined): string | null {
  const city = (value ?? "").trim().replace(/\s+/g, " ");
  return city || null;
}

async function saveDistributorPlace(
  crm: CrmClient,
  distributorId: string,
  state: string | null,
  city: string | null,
) {
  if (!state && !city) return { ok: true as const };
  if (!city) return { ok: false as const, error: "Informe a cidade do distribuidor." };

  const { data: existing, error: existingError } = await crm
    .from("distributor_regions")
    .select("id")
    .eq("distributor_id", distributorId)
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false as const, error: existingError.message };

  if (existing?.id) {
    const { error } = await crm
      .from("distributor_regions")
      .update({ region_name: city, state })
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  const { error } = await crm.from("distributor_regions").insert({
    distributor_id: distributorId,
    region_name: city,
    state,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

function revalidateDistributorSurfaces() {
  revalidatePath("/settings/distribuidores");
  revalidatePath("/distributors");
  revalidatePath("/inbox");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
}

async function findDistributorByName(crm: CrmClient, name: string, exceptId?: string) {
  const { data, error } = await crm.from("distributors").select("id, name").ilike("name", name);
  if (error) return { error: error.message, row: null as { id: string } | null };
  const row = (data ?? []).find((item) => item.id !== exceptId) ?? null;
  return { error: null as string | null, row };
}

export async function listDistributors(): Promise<
  { ok: true; distributors: DistributorDTO[]; canManage: boolean } | { ok: false; error: string }
> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  const { data, error } = await auth.crm
    .from("distributors")
    .select("id, name, active, distributor_regions(region_name, state)")
    .not("name", "ilike", `${PLACEHOLDER_DISTRIBUTOR_PREFIX}%`)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    distributors: (data ?? [])
      .filter((row) => !isPlaceholderDistributorName(row.name))
      .map((row) => {
        const regions = row.distributor_regions as
          | { region_name: string; state: string | null }
          | { region_name: string; state: string | null }[]
          | null;
        const region = Array.isArray(regions) ? regions[0] : regions;
        return {
          id: row.id,
          name: row.name,
          state: region?.state ?? null,
          city: region?.region_name ?? null,
          active: row.active,
        };
      }),
    canManage: canManageDistributors(auth.role),
  };
}

export async function createDistributorRecord(input: {
  name: string;
  state?: string | null;
  city?: string | null;
}): Promise<{ ok: true; distributor: DistributorDTO } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageDistributors(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar distribuidores." };
  }

  const name = normalizeDistributorName(input.name);
  if (!name) return { ok: false, error: "Informe o nome do distribuidor." };
  if (isPlaceholderDistributorName(name)) {
    return { ok: false, error: "Esse nome é reservado para a carteira." };
  }
  if (name.length > DISTRIBUTOR_NAME_MAX) {
    return { ok: false, error: `Use até ${DISTRIBUTOR_NAME_MAX} caracteres.` };
  }

  const existing = await findDistributorByName(auth.crm, name);
  if (existing.error) return { ok: false, error: existing.error };
  if (existing.row) return { ok: false, error: "Já existe um distribuidor com esse nome." };

  const state = normalizeState(input.state);
  const city = normalizeCity(input.city);
  const { data, error } = await auth.crm
    .from("distributors")
    .insert({ name, active: true })
    .select("id, name, active")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Erro ao salvar distribuidor." };

  const place = await saveDistributorPlace(auth.crm, data.id, state, city);
  if (!place.ok) return place;

  revalidateDistributorSurfaces();
  return { ok: true, distributor: { id: data.id, name: data.name, state, city, active: data.active } };
}

export async function updateDistributorRecord(input: {
  id: string;
  name?: string;
  state?: string | null;
  city?: string | null;
  active?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageDistributors(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar distribuidores." };
  }

  const id = input.id.trim();
  if (!id) return { ok: false, error: "Distribuidor inválido." };

  const patch: { name?: string; active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const name = normalizeDistributorName(input.name);
    if (!name) return { ok: false, error: "Informe o nome do distribuidor." };
    if (isPlaceholderDistributorName(name)) {
      return { ok: false, error: "Esse nome é reservado para a carteira." };
    }
    if (name.length > DISTRIBUTOR_NAME_MAX) {
      return { ok: false, error: `Use até ${DISTRIBUTOR_NAME_MAX} caracteres.` };
    }
    const existing = await findDistributorByName(auth.crm, name, id);
    if (existing.error) return { ok: false, error: existing.error };
    if (existing.row) return { ok: false, error: "Já existe um distribuidor com esse nome." };
    patch.name = name;
  }

  if (input.active !== undefined) patch.active = input.active;

  if (input.state !== undefined || input.city !== undefined) {
    const place = await saveDistributorPlace(
      auth.crm,
      id,
      normalizeState(input.state),
      normalizeCity(input.city),
    );
    if (!place.ok) return place;
  }

  const { data, error } = await auth.crm
    .from("distributors")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Distribuidor não encontrado." };

  revalidateDistributorSurfaces();
  return { ok: true };
}

export async function deleteDistributorRecord(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authedCrm();
  if (!auth.ok) return auth;
  if (!canManageDistributors(auth.role)) {
    return { ok: false, error: "Sem permissão para alterar distribuidores." };
  }

  const id = input.id.trim();
  if (!id) return { ok: false, error: "Distribuidor inválido." };

  const { error } = await auth.crm.from("distributors").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      error: "Não foi possível excluir. Desative o distribuidor se ele já estiver em uso.",
    };
  }

  revalidateDistributorSurfaces();
  return { ok: true };
}

export async function createDistributor(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const created = await createDistributorRecord({ name });
  if (!created.ok) return created;

  const region = String(formData.get("region") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (region) {
    const auth = await authedCrm();
    if (auth.ok) {
      await auth.crm.from("distributor_regions").insert({
        distributor_id: created.distributor.id,
        region_name: region,
        state: state || null,
      });
    }
  }

  revalidateDistributorSurfaces();
  return { ok: true as const };
}
