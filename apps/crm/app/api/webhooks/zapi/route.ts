import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { agentDebugLog } from "@/lib/agent-debug-log";
import {
  describeZapiParseFailure,
  explainZapiPhoneDiagnostics,
  ingestZapiMessage,
  parseZapiWebhookPayload,
  planZapiWebhookAction,
} from "@/lib/zapi/ingest";

const ZAPI_LOG_JSON_MAX = 56_000;

function shouldLogFullZapiPayload(body: unknown): boolean {
  if (process.env.ZAPI_WEBHOOK_LOG_PAYLOAD === "1") return true;
  if (process.env.ZAPI_WEBHOOK_LOG_PAYLOAD === "0") return false;
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.fromMe === true || b.fromMe === "true";
}

function logZapiPayloadJson(body: unknown, reason: string) {
  try {
    const s = JSON.stringify(body, null, 2);
    const out = s.length > ZAPI_LOG_JSON_MAX ? `${s.slice(0, ZAPI_LOG_JSON_MAX)}\n…[truncado ${s.length} chars]` : s;
    console.info(`[zapi webhook] PAYLOAD_COMPLETO (${reason})\n${out}`);
  } catch {
    console.info(`[zapi webhook] PAYLOAD_COMPLETO (${reason}): não serializável`);
  }
}

function isCrmSchemaNotExposed(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("PGRST106")) return true;
  if (msg.includes("The schema must be one of the following")) return true;
  const code =
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  return code === "PGRST106";
}

/** Diagnóstico rápido: abra no navegador GET /api/webhooks/zapi */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const service = !!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE);
  return NextResponse.json({
    ok: true,
    path: "/api/webhooks/zapi",
    env: {
      supabaseUrlConfigured: !!url,
      serviceRoleKeyConfigured: service,
      webhookSecretConfigured: !!process.env.ZAPI_WEBHOOK_SECRET,
    },
    checklist: [
      "Supabase → Data API → Exposed schemas: inclua «crm» (webhook E leitura do Inbox no browser).",
      "Variáveis no deploy: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
      "Z-API: mesma URL HTTPS em «Ao receber» e «Ao enviar»; secret no header se ZAPI_WEBHOOK_SECRET estiver definido.",
      "Logs: mensagens suas (fromMe) gravam o JSON completo no console; ZAPI_WEBHOOK_LOG_PAYLOAD=1 em todos os POSTs; =0 desliga. parse_failed também loga payload + diagnostico_campos_telefone.",
      "Mensagens antigas sem texto: rode apps/crm/supabase/manual/backfill_empty_message_bodies.sql (opcional).",
      "Webhook só com @lid: aplique migration 20260422180000_zapi_lid_map.sql; envie uma vez pelo Inbox para o número real para preencher o mapa LID→E.164 (GET phone-exists).",
    ],
  });
}

export async function POST(req: Request) {
  const secret = process.env.ZAPI_WEBHOOK_SECRET;
  if (secret) {
    const h = req.headers.get("x-zapi-secret") ?? req.headers.get("x-webhook-secret");
    if (h !== secret) {
      // #region agent log
      agentDebugLog({
        location: "route.ts:POST:unauthorized",
        message: "webhook_secret_mismatch",
        hypothesisId: "H1",
        data: { secretConfigured: true, headerPresent: !!h },
      });
      // #endregion
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // #region agent log
    agentDebugLog({
      location: "route.ts:POST:invalid_json",
      message: "body_not_json",
      hypothesisId: "H1",
    });
    // #endregion
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (shouldLogFullZapiPayload(body)) {
    logZapiPayloadJson(body, "fromMe ou ZAPI_WEBHOOK_LOG_PAYLOAD=1");
  }

  const rootKeys =
    body && typeof body === "object" ? Object.keys(body as object).slice(0, 24) : [];
  // #region agent log
  agentDebugLog({
    location: "route.ts:POST:body_received",
    message: "webhook_post_received",
    hypothesisId: "H2",
    data: { rootKeyCount: rootKeys.length, rootKeys },
  });
  // #endregion

  const intent = planZapiWebhookAction(body);
  // #region agent log
  agentDebugLog({
    location: "route.ts:POST:plan",
    message: "plan_zapi_webhook",
    hypothesisId: "H2",
    data:
      intent.action === "skip"
        ? { action: "skip", reason: intent.reason }
        : { action: "parse" },
  });
  // #endregion
  if (intent.action === "skip") {
    console.info("[zapi webhook] ignorado (não é mensagem de chat):", intent.reason);
    return NextResponse.json({ ok: true as const, skipped: intent.reason });
  }

  const parsed = parseZapiWebhookPayload(body);
  if (!parsed) {
    const keys =
      body && typeof body === "object" ? Object.keys(body as object) : [];
    const failDesc = describeZapiParseFailure(body);
    // #region agent log
    agentDebugLog({
      location: "route.ts:POST:parse_failed",
      message: "parse_zapi_failed",
      hypothesisId: "H3",
      data: {
        failureKind: failDesc.slice(0, 120),
        rootKeys: keys.slice(0, 30),
      },
    });
    // #endregion
    logZapiPayloadJson(body, "parse_failed");
    console.info("[zapi webhook] diagnostico_campos_telefone", explainZapiPhoneDiagnostics(body));
    console.warn(
      "[zapi webhook] parse_failed —",
      failDesc,
      "| chaves raiz:",
      keys.join(", "),
    );
    if (process.env.ZAPI_WEBHOOK_DEBUG === "1") {
      try {
        console.warn(
          "[zapi webhook] parse_failed body (trecho):",
          JSON.stringify(body).slice(0, 2500),
        );
      } catch {
        console.warn("[zapi webhook] parse_failed (body não serializável)");
      }
    }
    /** 200: a Z-API marca o webhook como OK; investigar com ZAPI_WEBHOOK_DEBUG=1 */
    return NextResponse.json(
      { ok: false as const, error: "parse_failed" as const, keys },
      { status: 200 },
    );
  }

  // #region agent log
  agentDebugLog({
    location: "route.ts:POST:parsed_ok",
    message: "parse_ok_before_ingest",
    hypothesisId: "H4",
    data: {
      direction: parsed.fromMe ? "out" : "in",
      eventType: parsed.eventType,
      hasProviderId: !!parsed.messageId,
      hasBodyText: !!(parsed.body && String(parsed.body).trim()),
    },
  });
  // #endregion

  console.info("[zapi webhook] mapeamento_crm", {
    pickSource: parsed.pickSource,
    phoneRaw: parsed.phoneRaw,
    chave_no_crm: parsed.phoneE164,
    direction: parsed.fromMe ? "out" : "in",
    messageId: parsed.messageId,
    eventType: parsed.eventType,
  });

  try {
    const result = await ingestZapiMessage(parsed);
    // #region agent log
    agentDebugLog({
      location: "route.ts:POST:ingest_result",
      message: "ingest_finished",
      hypothesisId: "H5",
      data: { result: result as Record<string, unknown> },
    });
    // #endregion
    revalidatePath("/inbox");
    return NextResponse.json(result);
  } catch (e) {
    console.error("[zapi webhook]", e);
    const msg = e instanceof Error ? e.message : String(e);
    // #region agent log
    agentDebugLog({
      location: "route.ts:POST:ingest_error",
      message: "ingest_threw",
      hypothesisId: "H1",
      data: { errorPreview: msg.slice(0, 200) },
    });
    // #endregion
    if (isCrmSchemaNotExposed(e)) {
      return NextResponse.json(
        {
          error: "crm_schema_not_exposed",
          detail: msg,
          fix: "No Supabase: Project Settings → Data API → Exposed schemas → adicione o schema «crm» (além de public). Sem isso o PostgREST bloqueia client.schema('crm').",
        },
        { status: 503 },
      );
    }
    if (msg.includes("pipeline_stages")) {
      return NextResponse.json(
        {
          error: "pipeline_stages_empty",
          detail: msg,
          fix: "No Supabase: SQL Editor e rode apps/crm/supabase/seed_pipeline_stages.sql (ou aplique as migrations completas).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "ingest_failed", detail: msg }, { status: 500 });
  }
}
