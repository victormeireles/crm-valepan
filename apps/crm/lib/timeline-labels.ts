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
};

export function timelineActivityLabel(action: string) {
  return TIMELINE_ACTIVITY_LABELS[action] ?? `Atividade: ${action}`;
}
