/**
 * Regras de ordem da lista do inbox (puro — sem React).
 * Marcar como lida não deve puxar o card para o topo.
 */

export function sidebarPreview(body: string | null | undefined): string {
  const text = (body ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "Sem mensagem ainda";
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

export function callStatusFromEvent(
  kind: string | null | undefined,
  status: string | null | undefined,
): "ringing" | "missed_voice" | "missed_video" | null {
  if (kind !== "whatsapp_call") return null;
  if (status === "ringing" || status === "missed_voice" || status === "missed_video") return status;
  return null;
}

export function patchConversationInPlace<T extends { id: string }>(rows: T[], next: T): T[] {
  let changed = false;
  const out = rows.map((row) => {
    if (row.id !== next.id) return row;
    changed = true;
    return next;
  });
  return changed ? out : rows;
}

export function moveConversationToFront<T extends { id: string }>(
  rows: T[],
  next: T,
  pageSize: number,
): T[] {
  const without = rows.filter((row) => row.id !== next.id);
  return [next, ...without].slice(0, pageSize);
}

/** Só sobe pro topo com atividade nova — marcar como lida não reordena. */
export function conversationActivityChanged(
  existing: {
    lastAt: string;
    preview: string;
    lastDirection: string | null;
    callStatus: "ringing" | "missed_voice" | "missed_video" | null;
  },
  detail: {
    lastMessageAt: string | null;
    lastBodyPreview: string | null;
    lastDirection: string | null;
    lastEventKind: string | null;
    lastEventStatus: string | null;
  },
): boolean {
  if (detail.lastMessageAt && detail.lastMessageAt !== existing.lastAt) return true;
  if (sidebarPreview(detail.lastBodyPreview) !== existing.preview) return true;
  if (detail.lastDirection !== existing.lastDirection) return true;
  if (callStatusFromEvent(detail.lastEventKind, detail.lastEventStatus) !== existing.callStatus) {
    return true;
  }
  return false;
}
