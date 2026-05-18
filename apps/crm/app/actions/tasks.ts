"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  const dueAt =
    typeof due === "string" && due.length > 0 ? new Date(due).toISOString() : null;
  const leadId = String(formData.get("lead_id") ?? "").trim() || null;
  const assigneeRaw = String(formData.get("assignee_id") ?? "").trim();
  let assigneeId: string | null = user.id;
  if (assigneeRaw.length > 0) {
    const { data: prof } = await crm.from("profiles").select("id").eq("id", assigneeRaw).maybeSingle();
    if (!prof?.id) return { ok: false as const, error: "Responsável pela tarefa inválido." };
    assigneeId = assigneeRaw;
  }

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
    assignee_id: assigneeId,
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
