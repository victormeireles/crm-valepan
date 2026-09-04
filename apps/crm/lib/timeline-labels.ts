/** Rótulos em português para `activity_logs.action` na timeline do lead. */
export const TIMELINE_ACTIVITY_LABELS: Record<string, string> = {
  created_manual: "Lead criado manualmente",
  created_from_whatsapp: "Lead criado via WhatsApp",
  created: "Oportunidade criada",
  stage_changed: "Etapa do funil alterada",
  stage_automation_tasks: "Tarefas automáticas da etapa",
  owner_changed: "Responsável alterado",
  task_completed: "Tarefa concluída",
  task_reopened: "Tarefa reaberta",
  task_deleted: "Tarefa excluída",
  task_rescheduled: "Prazo da tarefa alterado",
  follow_up_scheduled: "Follow-up agendado",
  follow_up_updated: "Follow-up atualizado",
  follow_up_rescheduled: "Follow-up reagendado",
  follow_up_completed: "Follow-up concluído",
  follow_up_reopened: "Follow-up reaberto",
  follow_up_deleted: "Follow-up excluído",
  excluded_from_pipeline: "Arquivado (não é prospect)",
  restored_to_pipeline: "Restaurado no funil",
};

export function timelineActivityLabel(action: string) {
  return TIMELINE_ACTIVITY_LABELS[action] ?? `Atividade: ${action}`;
}
