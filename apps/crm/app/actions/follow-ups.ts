"use server";

import { DEFAULT_FOLLOW_UP_TITLE, toFollowUpDTO } from "@/lib/follow-ups";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function revalidateFollowUpSurfaces(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

function parseFollowUpDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function saveLeadFollowUp(input: {
  leadId: string;
  title: string;
  dueAt: string;
  assigneeId: string | null;
}) {
  const title = input.title.trim() || DEFAULT_FOLLOW_UP_TITLE;
  const dueAt = parseFollowUpDate(input.dueAt);
  if (!dueAt) return { ok: false as const, error: "Informe uma data válida para o follow-up." };
  if (new Date(dueAt).getTime() <= Date.now()) {
    return { ok: false as const, error: "Escolha uma data futura para o follow-up." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: lead } = await crm
    .from("leads")
    .select("id, owner_id")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead?.id) return { ok: false as const, error: "Lead inválido." };

  const requestedAssigneeId = input.assigneeId ?? lead.owner_id ?? user.id;
  const { data: assignee } = requestedAssigneeId
    ? await crm.from("profiles").select("id").eq("id", requestedAssigneeId).maybeSingle()
    : { data: null };
  const assigneeId = assignee?.id ?? null;
  if (input.assigneeId && !assigneeId) {
    return { ok: false as const, error: "Responsável pelo follow-up inválido." };
  }

  const { data: opportunity } = await crm
    .from("opportunities")
    .select("id")
    .eq("lead_id", lead.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: current } = await crm
    .from("tasks")
    .select("id, title, due_at, assignee_id")
    .eq("lead_id", lead.id)
    .eq("task_kind", "follow_up")
    .eq("done", false)
    .maybeSingle();

  const values = {
    title,
    due_at: dueAt,
    assignee_id: assigneeId,
    opportunity_id: opportunity?.id ?? null,
    task_kind: "follow_up" as const,
    done: false,
    completed_at: null,
    updated_at: new Date().toISOString(),
  };

  let saved:
    | { id: string; title: string; due_at: string | null; assignee_id: string | null }
    | null = null;
  let saveError: { message: string; code?: string } | null = null;

  if (current?.id) {
    const result = await crm
      .from("tasks")
      .update(values)
      .eq("id", current.id)
      .select("id, title, due_at, assignee_id")
      .maybeSingle();
    saved = result.data;
    saveError = result.error;
  } else {
    const result = await crm
      .from("tasks")
      .insert({ ...values, lead_id: lead.id })
      .select("id, title, due_at, assignee_id")
      .maybeSingle();
    saved = result.data;
    saveError = result.error;

    // Duas telas podem tentar criar ao mesmo tempo. A restrição do banco
    // escolhe um único registro; a segunda operação passa a atualizá-lo.
    if (saveError?.code === "23505") {
      const { data: concurrent } = await crm
        .from("tasks")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("task_kind", "follow_up")
        .eq("done", false)
        .maybeSingle();
      if (concurrent?.id) {
        const retry = await crm
          .from("tasks")
          .update(values)
          .eq("id", concurrent.id)
          .select("id, title, due_at, assignee_id")
          .maybeSingle();
        saved = retry.data;
        saveError = retry.error;
      }
    }
  }

  const followUp = saved ? toFollowUpDTO(saved) : null;
  if (saveError || !followUp) {
    return { ok: false as const, error: saveError?.message ?? "Não foi possível salvar o follow-up." };
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: lead.id,
    action: current
      ? current.due_at === followUp.due_at
        ? "follow_up_updated"
        : "follow_up_rescheduled"
      : "follow_up_scheduled",
    actor_id: user.id,
    payload: {
      follow_up_id: followUp.id,
      title: followUp.title,
      from_due_at: current?.due_at ?? null,
      to_due_at: followUp.due_at,
      assignee_id: followUp.assignee_id,
    },
  });

  revalidateFollowUpSurfaces(lead.id);
  return { ok: true as const, followUp };
}

export async function completeLeadFollowUp(followUpId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: followUp } = await crm
    .from("tasks")
    .select("id, lead_id, title, due_at")
    .eq("id", followUpId)
    .eq("task_kind", "follow_up")
    .eq("done", false)
    .maybeSingle();
  if (!followUp?.lead_id) {
    return { ok: false as const, error: "Follow-up em aberto não encontrado." };
  }

  const completedAt = new Date().toISOString();
  const { data: updated, error } = await crm
    .from("tasks")
    .update({ done: true, completed_at: completedAt, updated_at: completedAt })
    .eq("id", followUp.id)
    .eq("done", false)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    return { ok: false as const, error: error?.message ?? "Não foi possível concluir o follow-up." };
  }

  await crm.from("activity_logs").insert({
    entity_type: "lead",
    entity_id: followUp.lead_id,
    action: "follow_up_completed",
    actor_id: user.id,
    payload: {
      follow_up_id: followUp.id,
      title: followUp.title,
      due_at: followUp.due_at,
    },
  });

  revalidateFollowUpSurfaces(followUp.lead_id);
  return { ok: true as const };
}
