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

const DELETED_MESSAGE_MARKERS = new Set([
  "conversa apagada",
  "mensagem apagada",
  "message deleted",
  "this message was deleted",
]);

function normalizedScalarText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return normalized || null;
}

/**
 * A Z-API pode representar uma revogação como `protocolMessage` ou como a frase
 * técnica "CONVERSA APAGADA". Esses eventos não são uma nova fala do contato.
 */
export function isZapiDeletedMessageEvent(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 6) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const protocol = o.protocolMessage;
  if (protocol && typeof protocol === "object" && !Array.isArray(protocol)) {
    const type = (protocol as Record<string, unknown>).type;
    if (type === 0 || type === "0" || normalizedScalarText(type) === "revoke") return true;
  }

  const directTexts = [
    o.body,
    o.text,
    o.messageText,
    o.content,
    o.text && typeof o.text === "object"
      ? (o.text as Record<string, unknown>).message
      : null,
  ];
  if (directTexts.some((text) => {
    const normalized = normalizedScalarText(text);
    return normalized !== null && DELETED_MESSAGE_MARKERS.has(normalized);
  })) {
    return true;
  }

  for (const key of [
    "message",
    "data",
    "payload",
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
  ] as const) {
    if (isZapiDeletedMessageEvent(o[key], depth + 1)) return true;
  }
  return false;
}
