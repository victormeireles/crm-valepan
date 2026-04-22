"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createLeadNote(formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId || !body) {
    return { ok: false as const, error: "Texto da nota é obrigatório." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: opp } = await crm
    .from("opportunities")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await crm.from("notes").insert({
    lead_id: leadId,
    opportunity_id: opp?.id ?? null,
    body,
    author_id: user.id,
  });

  if (error) return { ok: false as const, error: error.message };

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: leadId,
    action: "note_added",
    actor_id: user.id,
    payload: { preview: body.slice(0, 200) },
  });

  revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}
