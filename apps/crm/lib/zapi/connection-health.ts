import {
  clearZapiDisconnectedAlert,
  notifyZapiDisconnected,
} from "@/lib/zapi/disconnect-alert";

export type ZapiInstanceStatus = {
  connected: boolean;
  smartphoneConnected: boolean | null;
  error: string | null;
  raw: unknown;
};

/** Interpreta o JSON de GET /status da Z-API. */
export function parseZapiInstanceStatus(raw: unknown): ZapiInstanceStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.connected !== "boolean") return null;
  return {
    connected: o.connected,
    smartphoneConnected: typeof o.smartphoneConnected === "boolean" ? o.smartphoneConnected : null,
    error: typeof o.error === "string" && o.error.trim() ? o.error.trim() : null,
    raw,
  };
}

/** Consulta GET /instances/{id}/token/{token}/status. */
export async function fetchZapiInstanceStatus(): Promise<ZapiInstanceStatus> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID?.trim();
  const token = process.env.ZAPI_TOKEN?.trim();
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim();
  if (!inst || !token) {
    throw new Error("ZAPI_INSTANCE_ID e ZAPI_TOKEN são obrigatórios para health-check");
  }

  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}/status`;
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Z-API status failed: ${res.status} ${text.slice(0, 500)}`);
  }

  const parsed = parseZapiInstanceStatus(json);
  if (!parsed) {
    throw new Error(`Z-API status response inválida: ${text.slice(0, 500)}`);
  }
  return parsed;
}

/**
 * Health-check periódico: se offline, tenta alertar (1x até reconectar);
 * se online, libera o slot de alerta.
 */
export async function runZapiConnectionHealthCheck(): Promise<{
  ok: true;
  connected: boolean;
  smartphoneConnected: boolean | null;
  error: string | null;
  alertSent: boolean;
  alertReason: string | null;
  cleared: boolean;
}> {
  const status = await fetchZapiInstanceStatus();

  if (status.connected) {
    await clearZapiDisconnectedAlert();
    return {
      ok: true,
      connected: true,
      smartphoneConnected: status.smartphoneConnected,
      error: status.error,
      alertSent: false,
      alertReason: null,
      cleared: true,
    };
  }

  const detailParts = [
    status.error ?? "connected=false",
    status.smartphoneConnected === false ? "smartphoneConnected=false" : null,
  ].filter(Boolean);

  const alert = await notifyZapiDisconnected({
    source: "cron:status",
    detail: detailParts.join(" | "),
  });

  return {
    ok: true,
    connected: false,
    smartphoneConnected: status.smartphoneConnected,
    error: status.error,
    alertSent: alert.sent,
    alertReason: alert.reason ?? null,
    cleared: false,
  };
}
