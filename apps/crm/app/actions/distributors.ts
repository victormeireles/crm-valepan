"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createDistributor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Nome obrigatório" };

  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: dist, error } = await crm
    .from("distributors")
    .insert({ name, active: true })
    .select("id")
    .single();

  if (error || !dist) return { ok: false as const, error: error?.message ?? "Erro" };

  const region = String(formData.get("region") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (region) {
    await crm.from("distributor_regions").insert({
      distributor_id: dist.id,
      region_name: region,
      state: state || null,
    });
  }

  revalidatePath("/distributors");
  return { ok: true as const };
}
