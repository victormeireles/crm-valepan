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

  const { error } = await crm.from("tasks").insert({
    title,
    due_at: dueAt,
    assignee_id: user.id,
    done: false,
    lead_id: leadId,
  });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
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
    .select("lead_id")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await crm
    .from("tasks")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (taskRow?.lead_id) revalidatePath(`/leads/${taskRow.lead_id}`);
  return { ok: true as const };
}
