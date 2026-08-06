import { processDocumentInsight } from "@/lib/document-intelligence";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function authorizedMessage(messageId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };

  const crm = crmTables(supabase);
  const { data: message } = await crm
    .from("messages")
    .select("id, media_kind")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || (message.media_kind !== "document" && message.media_kind !== "image")) {
    return { error: NextResponse.json({ error: "Documento não encontrado" }, { status: 404 }) };
  }
  return { crm };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  const access = await authorizedMessage(messageId);
  if ("error" in access) return access.error;

  const { data, error } = await access.crm
    .from("document_insights")
    .select(
      "message_id, status, extracted_text, summary, document_type, language, keywords, model, error_message, processed_at, updated_at",
    )
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ insight: data ?? null });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  const access = await authorizedMessage(messageId);
  if ("error" in access) return access.error;

  try {
    const insight = await processDocumentInsight(messageId);
    return NextResponse.json({ insight });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao analisar documento." },
      { status: 500 },
    );
  }
}
