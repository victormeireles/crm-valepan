export type LeadFollowUpDTO = {
  id: string;
  title: string;
  due_at: string;
  assignee_id: string | null;
};

export const DEFAULT_FOLLOW_UP_TITLE = "Retomar contato";

export function toFollowUpDTO(row: {
  id: string;
  title: string;
  due_at: string | null;
  assignee_id: string | null;
}): LeadFollowUpDTO | null {
  if (!row.due_at) return null;
  return {
    id: row.id,
    title: row.title,
    due_at: row.due_at,
    assignee_id: row.assignee_id,
  };
}

export function indexFollowUpsByLead(
  rows: Array<{
    id: string;
    lead_id: string | null;
    title: string;
    due_at: string | null;
    assignee_id: string | null;
  }>,
): Map<string, LeadFollowUpDTO> {
  const result = new Map<string, LeadFollowUpDTO>();
  for (const row of rows) {
    if (!row.lead_id || result.has(row.lead_id)) continue;
    const followUp = toFollowUpDTO(row);
    if (followUp) result.set(row.lead_id, followUp);
  }
  return result;
}
