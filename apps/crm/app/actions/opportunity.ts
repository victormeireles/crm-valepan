"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateOpportunityStage(input: {
  opportunityId: string;
  stageId: string;
  lostReason: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const { data: stage } = await crm
    .from("pipeline_stages")
    .select("id, name, is_final")
    .eq("id", input.stageId)
    .single();

  if (!stage) return { ok: false as const, error: "Etapa inválida" };

  const isLost = stage.name.toLowerCase().includes("perdido");
  if (isLost && (!input.lostReason || !input.lostReason.trim())) {
    return { ok: false as const, error: "Informe o motivo de perda." };
  }

  const { data: oppRow } = await crm
    .from("opportunities")
    .select("lead_id")
    .eq("id", input.opportunityId)
    .maybeSingle();

  const { error } = await crm
    .from("opportunities")
    .update({
      stage_id: input.stageId,
      lost_reason: isLost ? input.lostReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.opportunityId);

  if (error) return { ok: false as const, error: error.message };

  if (oppRow?.lead_id) {
    revalidatePath(`/leads/${oppRow.lead_id}`);
  }

  await crm.from("activity_logs").insert({
    entity_type: "opportunity",
    entity_id: input.opportunityId,
    action: "stage_changed",
    payload: { stage_id: input.stageId, lost_reason: input.lostReason },
    actor_id: user.id,
  });

  revalidatePath("/pipeline");
  revalidatePath("/leads");
  return { ok: true as const };
}

export async function createOpportunityForLead(leadId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);

  const { data: stage } = await crm
    .from("pipeline_stages")
    .select("id")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!stage?.id) {
    return { ok: false as const, error: "Nenhuma etapa de funil configurada." };
  }

  const { data: lead } = await crm
    .from("leads")
    .select("phone_e164")
    .eq("id", leadId)
    .maybeSingle();

  const title = lead?.phone_e164 ? `Oportunidade ${lead.phone_e164}` : "Nova oportunidade";

  const { data: inserted, error } = await crm
    .from("opportunities")
    .insert({
      lead_id: leadId,
      stage_id: stage.id,
      title,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false as const, error: error?.message ?? "Erro ao criar oportunidade." };
  }

  await crm.from("activity_logs").insert({
    entity_type: "opportunity",
    entity_id: inserted.id,
    action: "created",
    actor_id: user.id,
    payload: { lead_id: leadId },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const, opportunityId: inserted.id };
}

export async function updateOpportunityDetails(input: {
  opportunityId: string;
  title: string;
  nextActionAt: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Título obrigatório." };

  const { data: opp } = await crm
    .from("opportunities")
    .select("lead_id")
    .eq("id", input.opportunityId)
    .maybeSingle();

  const { error } = await crm
    .from("opportunities")
    .update({
      title,
      next_action_at: input.nextActionAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.opportunityId);

  if (error) return { ok: false as const, error: error.message };

  if (opp?.lead_id) {
    revalidatePath(`/leads/${opp.lead_id}`);
  }
  revalidatePath("/pipeline");
  return { ok: true as const };
}
