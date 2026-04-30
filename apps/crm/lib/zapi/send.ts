/**
 * Corpo `phone` da Z-API: dígitos E.164 ou `123@lid` / prefixo interno `lid:123` do CRM.
 */
export function formatPhoneForZapiSend(phone: string): string {
  const t = phone.trim();
  if (t.toLowerCase().includes("@g.us")) {
    const i = t.toLowerCase().indexOf("@g.us");
    return t.slice(0, i + 5).replace(/\s/g, "");
  }
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

export type ZapiContactItem = {
  phone: string;
  name: string | null;
};

export async function fetchZapiContacts(page = 1, pageSize = 200): Promise<ZapiContactItem[]> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    throw new Error("ZAPI_INSTANCE_ID e ZAPI_TOKEN são obrigatórios para listar contatos");
  }

  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}/contacts?page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Z-API contacts failed: ${res.status} ${t}`);
  }

  const raw: unknown = await res.json().catch(() => []);
  const arr = Array.isArray(raw) ? raw : [];
  const out: ZapiContactItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const phone = typeof o.phone === "string" ? o.phone.trim() : "";
    if (!phone) continue;
    const nameCandidates = [o.name, o.short, o.vname, o.notify];
    let name: string | null = null;
    for (const c of nameCandidates) {
      if (typeof c === "string" && c.trim()) {
        name = c.trim();
        break;
      }
    }
    out.push({ phone, name });
  }
  return out;
}

export async function sendZapiContact(
  toPhoneDigits: string,
  contactName: string,
  contactPhone: string,
): Promise<{ raw: unknown; providerMessageId: string | null }> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    throw new Error("ZAPI_INSTANCE_ID e ZAPI_TOKEN são obrigatórios para envio");
  }

  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}/send-contact`;
  const phoneParam = formatPhoneForZapiSend(toPhoneDigits);
  const sharedPhone = contactPhone.replace(/\D/g, "");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
    body: JSON.stringify({
      phone: phoneParam,
      contactName: contactName.trim(),
      contactPhone: sharedPhone,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Z-API send-contact failed: ${res.status} ${t}`);
  }

  const raw: unknown = await res.json().catch(() => ({}));
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const providerMessageId =
    (typeof o.messageId === "string" && o.messageId) ||
    (typeof o.zaapId === "string" && o.zaapId) ||
    null;

  return { raw, providerMessageId };
}

type ZapiSendFileKind = "image" | "video" | "document";

async function sendZapiFileByBase64(input: {
  toPhoneDigits: string;
  kind: ZapiSendFileKind;
  dataUrl: string;
  fileName?: string;
  caption?: string;
}): Promise<{ raw: unknown; providerMessageId: string | null }> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    throw new Error("ZAPI_INSTANCE_ID e ZAPI_TOKEN são obrigatórios para envio");
  }

  const endpoint =
    input.kind === "document"
      ? "/send-document/base64"
      : input.kind === "video"
        ? "/send-video"
        : "/send-image";
  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}${endpoint}`;
  const phoneParam = formatPhoneForZapiSend(input.toPhoneDigits);

  const body: Record<string, unknown> = { phone: phoneParam };
  if (input.kind === "document") {
    body.document = input.dataUrl;
    if (input.fileName?.trim()) body.fileName = input.fileName.trim();
  } else if (input.kind === "video") {
    body.video = input.dataUrl;
    body.caption = input.caption ?? "";
    body.viewOnce = false;
  } else {
    body.image = input.dataUrl;
    body.caption = input.caption ?? "";
    body.viewOnce = false;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Z-API ${input.kind} failed: ${res.status} ${t}`);
  }

  const raw: unknown = await res.json().catch(() => ({}));
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const providerMessageId =
    (typeof o.messageId === "string" && o.messageId) ||
    (typeof o.zaapId === "string" && o.zaapId) ||
    null;

  return { raw, providerMessageId };
}

export async function sendZapiImage(
  toPhoneDigits: string,
  imageDataUrl: string,
  caption?: string,
) {
  return sendZapiFileByBase64({
    toPhoneDigits,
    kind: "image",
    dataUrl: imageDataUrl,
    caption,
  });
}

export async function sendZapiVideo(
  toPhoneDigits: string,
  videoDataUrl: string,
  caption?: string,
) {
  return sendZapiFileByBase64({
    toPhoneDigits,
    kind: "video",
    dataUrl: videoDataUrl,
    caption,
  });
}

export async function sendZapiDocument(
  toPhoneDigits: string,
  documentDataUrl: string,
  fileName?: string,
) {
  return sendZapiFileByBase64({
    toPhoneDigits,
    kind: "document",
    dataUrl: documentDataUrl,
    fileName,
  });
}
