"use server";

import { parseDueAtFormValue } from "@/lib/calendar-events";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Crm = ReturnType<typeof crmTables>;

/** `tasks.assignee_id` referencia `crm.profiles`, não `auth.users`. */
async function resolveTaskAssigneeId(
  crm: Crm,
  actorUserId: string,
  assigneeRaw: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const pick = assigneeRaw.length > 0 ? assigneeRaw : actorUserId;
  const { data: prof } = await crm.from("profiles").select("id").eq("id", pick).maybeSingle();
  if (!prof?.id) {
    if (assigneeRaw.length > 0) {
      return { ok: false, error: "Responsável pela tarefa inválido." };
    }
    return { ok: true, id: null };
  }
  return { ok: true, id: prof.id };
}

export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false as const, error: "Título obrigatório" };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const due = formData.get("due_at");
  const dueAt = typeof due === "string" ? parseDueAtFormValue(due) : null;
  const leadId = String(formData.get("lead_id") ?? "").trim() || null;
  if (leadId) {
    const { data: leadRow } = await crm.from("leads").select("id").eq("id", leadId).maybeSingle();
    if (!leadRow?.id) return { ok: false as const, error: "Lead inválido." };
  }
  const assigneeRaw = String(formData.get("assignee_id") ?? "").trim();
  const assigneeId = await resolveTaskAssigneeId(crm, user.id, assigneeRaw);
  if (!assigneeId.ok) return { ok: false as const, error: assigneeId.error };

  const oppRaw = String(formData.get("opportunity_id") ?? "").trim();
  let opportunityId: string | null = null;
  if (oppRaw.length > 0) {
    if (!leadId) return { ok: false as const, error: "Lead obrigatório para vincular oportunidade." };
    const { data: opp } = await crm
      .from("opportunities")
      .select("id")
      .eq("id", oppRaw)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!opp?.id) return { ok: false as const, error: "Oportunidade inválida para este lead." };
    opportunityId = oppRaw;
  }

  const { error } = await crm.from("tasks").insert({
    title,
    due_at: dueAt,
    assignee_id: assigneeId.id,
    done: false,
    lead_id: leadId,
    opportunity_id: opportunityId,
  });

  if (error) return { ok: false as const, error: error.message };

  if (opportunityId && dueAt) {
    await crm
      .from("opportunities")
      .update({
        next_action_at: dueAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return { ok: true as const };
}

export async function toggleTaskDone(taskId: string, done: boolean) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  const crm = crmTables(supabase);
  const { data: taskRow } = await crm
    .from("tasks")
    .select("lead_id, title")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await crm
    .from("tasks")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false as const, error: error.message };

  if (taskRow?.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: taskRow.lead_id,
      action: done ? "task_completed" : "task_reopened",
      actor_id: user.id,
      payload: { task_id: taskId, title: taskRow.title },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  if (taskRow?.lead_id) revalidatePath(`/leads/${taskRow.lead_id}`);
  return { ok: true as const };
}

export async function updateTaskAssignee(input: {
  taskId: string;
  assigneeId: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);

  if (input.assigneeId) {
    const { data: prof } = await crm.from("profiles").select("id").eq("id", input.assigneeId).maybeSingle();
    if (!prof?.id) return { ok: false as const, error: "Responsável inválido." };
  }

  const { data: taskRow } = await crm.from("tasks").select("lead_id").eq("id", input.taskId).maybeSingle();

  const { error } = await crm
    .from("tasks")
    .update({ assignee_id: input.assigneeId, updated_at: new Date().toISOString() })
    .eq("id", input.taskId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  if (taskRow?.lead_id) revalidatePath(`/leads/${taskRow.lead_id}`);
  return { ok: true as const };
}

function revalidateTaskSurfaces(leadId: string | null | undefined) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

async function syncOpportunityNextAction(crm: Crm, opportunityId: string) {
  const { data: tasks } = await crm
    .from("tasks")
    .select("due_at")
    .eq("opportunity_id", opportunityId)
    .eq("done", false)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(1);

  const nextAt = tasks?.[0]?.due_at ?? null;
  await crm
    .from("opportunities")
    .update({ next_action_at: nextAt, updated_at: new Date().toISOString() })
    .eq("id", opportunityId);
}

export async function deleteTask(taskId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: taskRow } = await crm
    .from("tasks")
    .select("lead_id, title, opportunity_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!taskRow) return { ok: false as const, error: "Tarefa não encontrada." };

  const { error } = await crm.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false as const, error: error.message };

  if (taskRow.opportunity_id) {
    await syncOpportunityNextAction(crm, taskRow.opportunity_id);
  }

  if (taskRow.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: taskRow.lead_id,
      action: "task_deleted",
      actor_id: user.id,
      payload: { task_id: taskId, title: taskRow.title },
    });
  }

  revalidateTaskSurfaces(taskRow.lead_id);
  return { ok: true as const };
}

export async function updateTaskDueAt(taskId: string, newDueAtIso: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const dueAtIso = parseDueAtFormValue(newDueAtIso);
  if (!dueAtIso) {
    return { ok: false as const, error: "Data inválida." };
  }

  const crm = crmTables(supabase);
  const { data: taskRow } = await crm
    .from("tasks")
    .select("lead_id, title, opportunity_id, due_at")
    .eq("id", taskId)
    .maybeSingle();

  if (!taskRow) return { ok: false as const, error: "Tarefa não encontrada." };

  const { error } = await crm
    .from("tasks")
    .update({ due_at: dueAtIso, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { ok: false as const, error: error.message };

  if (taskRow.opportunity_id) {
    await crm
      .from("opportunities")
      .update({
        next_action_at: dueAtIso,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskRow.opportunity_id);
  }

  if (taskRow.lead_id) {
    await crm.from("activity_logs").insert({
      entity_type: "lead",
      entity_id: taskRow.lead_id,
      action: "task_rescheduled",
      actor_id: user.id,
      payload: {
        task_id: taskId,
        title: taskRow.title,
        from_due_at: taskRow.due_at,
        to_due_at: dueAtIso,
      },
    });
  }

  revalidateTaskSurfaces(taskRow.lead_id);
  return { ok: true as const };
}
