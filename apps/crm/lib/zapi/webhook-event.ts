/**
 * Reações chegam como webhooks próprios, embora no WhatsApp sejam apenas um emoji
 * anexado a uma mensagem existente. Sem este filtro elas viram um balão artificial
 * "[Reação]" no histórico do CRM.
 */
export function hasZapiReactionPayload(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 5) {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (o.reaction != null || o.reactionMessage != null) return true;

  for (const key of [
    "message",
    "data",
    "payload",
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "protocolMessage",
  ] as const) {
    if (hasZapiReactionPayload(o[key], depth + 1)) return true;
  }
  return false;
}

/** Compatibilidade com reações que já foram gravadas antes do filtro do webhook. */
export function isLegacyZapiReactionBody(body: string | null): boolean {
  const normalized = body?.trim().toLocaleLowerCase("pt-BR") ?? "";
  return normalized === "[reação]" || normalized.startsWith("reação:");
}
