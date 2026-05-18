import type { crmTables } from "@/lib/supabase/server";

type CrmClient = ReturnType<typeof crmTables>;

export type ApplyStageAutomationsInput = {
  opportunityId: string;
  leadId: string | null;
  stageId: string;
  previousStageId: string | null;
  assigneeId: string | null;
  actorId: string | null;
};

export type ApplyStageAutomationsResult = {
  created: number;
  skipped: number;
  taskTitles: string[];
};

export async function applyPipelineStageEntryAutomations(
  crm: CrmClient,
  input: ApplyStageAutomationsInput,
): Promise<ApplyStageAutomationsResult> {
  const empty: ApplyStageAutomationsResult = { created: 0, skipped: 0, taskTitles: [] };

  if (input.previousStageId === input.stageId) return empty;

  const { data: templates, error: tplErr } = await crm
    .from("pipeline_stage_task_templates")
    .select("id, title, due_days_offset, sort_order")
    .eq("stage_id", input.stageId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (tplErr || !templates?.length) return empty;

  const { data: existingLogs } = await crm
    .from("pipeline_stage_automation_log")
    .select("template_id")
    .eq("opportunity_id", input.opportunityId);

  const alreadyApplied = new Set((existingLogs ?? []).map((r) => r.template_id));

  let created = 0;
  let skipped = 0;
  const taskTitles: string[] = [];

  for (const tpl of templates) {
    if (alreadyApplied.has(tpl.id)) {
      skipped += 1;
      continue;
    }

    let dueAt: string | null = null;
    if (tpl.due_days_offset !== null && tpl.due_days_offset !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() + tpl.due_days_offset);
      dueAt = d.toISOString();
    }

    const assigneeId = input.assigneeId ?? input.actorId;

    const { data: task, error: taskErr } = await crm
      .from("tasks")
      .insert({
        title: tpl.title,
        lead_id: input.leadId,
        opportunity_id: input.opportunityId,
        due_at: dueAt,
        assignee_id: assigneeId,
        done: false,
      })
      .select("id")
      .single();

    if (taskErr || !task?.id) {
      skipped += 1;
      continue;
    }

    const { error: logErr } = await crm.from("pipeline_stage_automation_log").insert({
      opportunity_id: input.opportunityId,
      template_id: tpl.id,
      task_id: task.id,
    });

    if (logErr) {
      skipped += 1;
      continue;
    }

    created += 1;
    taskTitles.push(tpl.title);
    alreadyApplied.add(tpl.id);
  }

  return { created, skipped, taskTitles };
}
