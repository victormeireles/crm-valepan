import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient, crmTables } from "@/lib/supabase/admin";
import { CAPTURE_NOTICE_VERSION, IFOOD_CAMPAIGN, leadCaptureSchema } from "@/lib/lead-capture";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 4096;

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}

async function readSmallBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next pode montar request.url com hostname interno (localhost). O Host recebido
  // representa o endereço público efetivamente acessado pelo navegador.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let sameOrigin = false;
  try {
    const originUrl = new URL(origin ?? "");
    sameOrigin = ["http:", "https:"].includes(originUrl.protocol) && originUrl.host === host;
  } catch { /* Origem ausente ou inválida. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ ok: false, error: "Abra a página de cadastro e tente novamente." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply({ ok: false, error: "Formato de cadastro inválido." }, 415);
  }

  let body: unknown;
  try {
    const text = await readSmallBody(request);
    if (text === null) return reply({ ok: false, error: "O cadastro excedeu o tamanho permitido." }, 413);
    body = JSON.parse(text);
  } catch {
    return reply({ ok: false, error: "Não foi possível ler o cadastro. Tente novamente." }, 400);
  }

  const parsed = leadCaptureSchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([key, messages]) => [key, messages?.[0]]),
    );
    return reply({ ok: false, error: "Confira os campos indicados.", fields }, 400);
  }
  // Campo invisível para pessoas; bots recebem a mesma resposta sem criar dados.
  if (parsed.data.website?.trim()) return reply({ ok: true });

  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE;
    if (!secret) throw new Error("capture_not_configured");
    // A Vercel fornece este cabeçalho; não usamos X-Forwarded-For enviado pelo visitante.
    const candidate = process.env.VERCEL
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ?? ""
      : "";
    const ip = isIP(candidate) ? candidate : "shared";
    const requestKey = createHmac("sha256", secret).update(`lead-capture:${ip}`).digest("hex");
    const crm = crmTables(createAdminSupabaseClient());
    const { error } = await crm.rpc("register_public_lead", {
      p_source: IFOOD_CAMPAIGN.source,
      p_name: parsed.data.name,
      p_phone: parsed.data.phone,
      p_client_category: parsed.data.clientType,
      p_zip_code: parsed.data.zipCode,
      p_request_key: requestKey,
      p_notice_version: CAPTURE_NOTICE_VERSION,
      p_document: parsed.data.document || null,
    });
    if (error?.code === "P0429") {
      return reply({ ok: false, error: "Muitos cadastros neste momento. Aguarde um minuto e tente novamente." }, 429);
    }
    if (error) {
      console.error("[lead-capture] Falha ao salvar", { code: error.code });
      return reply({ ok: false, error: "Não conseguimos salvar agora. Seus dados continuam aqui; tente novamente em instantes." }, 503);
    }
    // Não informa se o telefone já existia nem expõe identificadores internos.
    return reply({ ok: true });
  } catch {
    console.error("[lead-capture] Serviço indisponível");
    return reply({ ok: false, error: "Não conseguimos salvar agora. Seus dados continuam aqui; tente novamente em instantes." }, 503);
  }
}
