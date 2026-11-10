import { NextResponse } from "next/server";
import { runZapiConnectionHealthCheck } from "@/lib/zapi/connection-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function run() {
  try {
    const result = await runZapiConnectionHealthCheck();
    console.info("[zapi-connection-health]", result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no health-check Z-API.";
    console.error("[zapi-connection-health] cron failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return run();
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return run();
}
