import { NextResponse } from "next/server";
import { runPipelineAdvanceJob } from "@/lib/pipeline-advance-job";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function run() {
  try {
    const result = await runPipelineAdvanceJob();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no job de sugestões.";
    console.error("[pipeline-advance] cron failed", error);
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
