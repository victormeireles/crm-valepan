import { createAdminSupabaseClient, crmTables } from "@/lib/supabase/admin";

export type ZapiConnectionEvent = "connected" | "disconnected";

const DISCONNECTED_HINTS = [
  "disconnected",
  "desconect",
  "not connected",
  "nao conectado",
  "não conectado",
  "you need to be connected",
  "instance is not connected",
  "instance not connected",
  "whatsapp is not connected",
  "phone is not connected",
  "device is not connected",
  "sem conexao",
  "sem conexão",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Detecta Connected/DisconnectedCallback no payload do webhook Z-API. */
export function getZapiConnectionEvent(body: unknown): ZapiConnectionEvent | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root.payload && typeof root.payload === "object"
        ? (root.payload as Record<string, unknown>)
        : null;

  const raw =
    (typeof root.type === "string" && root.type) ||
    (typeof root.Type === "string" && root.Type) ||
    (typeof root.event === "string" && root.event) ||
    (typeof nested?.type === "string" && nested.type) ||
    (typeof nested?.Type === "string" && nested.Type) ||
    "";

  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t === "disconnectedcallback" || t === "disconnected") return "disconnected";
  if (t === "connectedcallback" || t === "connected") return "connected";
  return null;
}

/** Heurística sobre status/corpo de erro da Z-API. */
export function isZapiDisconnectedError(status: number, bodyText: string): boolean {
  const text = normalizeText(bodyText ?? "");
  if (!text && status !== 400 && status !== 401 && status !== 403 && status !== 409 && status !== 503) {
    return false;
  }
  return DISCONNECTED_HINTS.some((hint) => text.includes(normalizeText(hint)));
}

function zapiInstanceId(): string | null {
  const id = process.env.ZAPI_INSTANCE_ID?.trim();
  return id || null;
}

async function sendResendDisconnectEmail(input: {
  source: string;
  detail?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.RESEND_ERRORS_TO_EMAIL?.trim();
  if (!apiKey || !from || !to) {
    return {
      ok: false,
      reason: "RESEND_API_KEY, RESEND_FROM_EMAIL e RESEND_ERRORS_TO_EMAIL são obrigatórios",
    };
  }

  const instanceId = zapiInstanceId() ?? "(sem ZAPI_INSTANCE_ID)";
  const when = new Date().toISOString();
  const detail = (input.detail ?? "").trim().slice(0, 1500);
  const subject = "CRM Valepan: WhatsApp comercial desconectado (Z-API)";
  const text = [
    "O número comercial da Z-API parece desconectado.",
    "",
    `Instância: ${instanceId}`,
    `Origem: ${input.source}`,
    `Quando: ${when}`,
    detail ? `Detalhe: ${detail}` : null,
    "",
    "Enquanto permanecer desconectado, este aviso não se repete.",
    "Ao reconectar (ConnectedCallback), um novo desconecte voltará a alertar.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `resend_http_${res.status}:${body.slice(0, 300)}` };
  }
  return { ok: true };
}

/**
 * Tenta enviar o e-mail de desconexão uma única vez até clearZapiDisconnectedAlert.
 * Seguro para chamar em paralelo (claim atômico no Postgres).
 */
export async function notifyZapiDisconnected(input: {
  source: string;
  detail?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const instanceId = zapiInstanceId();
  if (!instanceId) {
    return { sent: false, reason: "missing_zapi_instance_id" };
  }

  try {
    const crm = crmTables(createAdminSupabaseClient());
    const { data: claimed, error } = await crm.rpc("claim_zapi_disconnect_alert", {
      p_instance_id: instanceId,
      p_source: input.source,
      p_detail: (input.detail ?? "").slice(0, 1500),
    });

    if (error) {
      console.error("[zapi disconnect-alert] claim failed:", error.message);
      return { sent: false, reason: `claim_failed:${error.message}` };
    }
    if (!claimed) {
      return { sent: false, reason: "already_alerted" };
    }

    const mail = await sendResendDisconnectEmail(input);
    if (!mail.ok) {
      console.error("[zapi disconnect-alert] resend failed:", mail.reason);
      // Libera o slot para nova tentativa se o e-mail não saiu.
      try {
        await crm.rpc("clear_zapi_disconnect_alert", { p_instance_id: instanceId });
      } catch {
        // ignore
      }
      return { sent: false, reason: mail.reason };
    }

    console.info("[zapi disconnect-alert] email enviado", { source: input.source });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[zapi disconnect-alert] notify failed:", msg);
    return { sent: false, reason: msg };
  }
}

/** Libera o alerta após ConnectedCallback (próximo disconnect avisa de novo). */
export async function clearZapiDisconnectedAlert(): Promise<void> {
  const instanceId = zapiInstanceId();
  if (!instanceId) return;
  try {
    const crm = crmTables(createAdminSupabaseClient());
    const { error } = await crm.rpc("clear_zapi_disconnect_alert", {
      p_instance_id: instanceId,
    });
    if (error) {
      console.error("[zapi disconnect-alert] clear failed:", error.message);
      return;
    }
    console.info("[zapi disconnect-alert] alerta liberado (conectado)");
  } catch (e) {
    console.error(
      "[zapi disconnect-alert] clear threw:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/** Se o corpo HTTP indicar desconexão, dispara o alerta (não-bloqueante para o caller). */
export function maybeNotifyZapiDisconnectedFromHttpError(
  label: string,
  status: number,
  bodyText: string,
): void {
  if (!isZapiDisconnectedError(status, bodyText)) return;
  void notifyZapiDisconnected({
    source: `api:${label}`,
    detail: `${status} ${bodyText}`.slice(0, 1500),
  }).catch((e) => {
    console.error(
      "[zapi disconnect-alert] background notify failed:",
      e instanceof Error ? e.message : String(e),
    );
  });
}
