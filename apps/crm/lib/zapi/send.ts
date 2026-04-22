/**
 * Corpo `phone` da Z-API: dígitos E.164 ou `123@lid` / prefixo interno `lid:123` do CRM.
 */
export function formatPhoneForZapiSend(phone: string): string {
  const t = phone.trim();
  if (t.startsWith("lid:")) {
    const digits = t.slice(4).replace(/\D/g, "");
    return digits ? `${digits}@lid` : t;
  }
  if (t.toLowerCase().includes("@lid")) {
    const i = t.toLowerCase().indexOf("@lid");
    return t.slice(0, i + 4).replace(/\s/g, "");
  }
  return t.replace(/\D/g, "");
}

/**
 * Envia texto via Z-API (servidor). Documentação: instância + token no path.
 */
export async function sendZapiText(
  toPhoneDigits: string,
  message: string,
): Promise<{ raw: unknown; providerMessageId: string | null }> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    throw new Error("ZAPI_INSTANCE_ID e ZAPI_TOKEN são obrigatórios para envio");
  }

  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}/send-text`;
  const phoneParam = formatPhoneForZapiSend(toPhoneDigits);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
    body: JSON.stringify({
      phone: phoneParam,
      message,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Z-API send failed: ${res.status} ${t}`);
  }

  const raw: unknown = await res.json().catch(() => ({}));
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  /** Mesmo identificador que costuma vir no webhook (deduplica ingest). */
  const providerMessageId =
    (typeof o.messageId === "string" && o.messageId) ||
    (typeof o.zaapId === "string" && o.zaapId) ||
    null;

  return { raw, providerMessageId };
}
