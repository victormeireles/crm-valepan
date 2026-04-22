"use server";

import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

export async function createLead(formData: FormData) {
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const source = String(formData.get("source") ?? "manual").trim() || "manual";
  const normalized = normalizeBrazilPhoneToE164(rawPhone);
  if (!normalized) {
    return { ok: false as const, error: "Telefone inválido." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: existing } = await crm
    .from("leads")
    .select("id")
    .eq("phone_e164", normalized)
    .maybeSingle();
  if (existing?.id) {
    return { ok: false as const, error: "Já existe lead para este telefone." };
  }

  const { data: inserted, error } = await crm
    .from("leads")
    .insert({
      phone_e164: normalized,
      source,
      status: "open",
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false as const, error: error?.message ?? "Erro ao criar lead." };
  }

  const { data: firstStage } = await crm
    .from("pipeline_stages")
    .select("id")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstStage?.id) {
    await crm.from("opportunities").insert({
      lead_id: inserted.id,
      stage_id: firstStage.id,
      title: `Lead ${normalized}`,
      owner_id: user.id,
    });
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: inserted.id,
    action: "created_manual",
    actor_id: user.id,
    payload: { source, phone: normalized },
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const, id: inserted.id };
}
