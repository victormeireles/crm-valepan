export type PipelineConversationPeekTarget = {
  conversationId: string;
  personName: string;
};

export function pipelineConversationPeekTarget(
  conversationId: string | null | undefined,
  personName: string,
): PipelineConversationPeekTarget | null {
  const id = conversationId?.trim() ?? "";
  if (!id) return null;
  return {
    conversationId: id,
    personName: personName.trim() || "Cliente",
  };
}

export function inboxConversationHref(conversationId: string): string {
  const id = conversationId.trim();
  if (!id) return "/inbox";
  return `/inbox?cid=${encodeURIComponent(id)}`;
}
