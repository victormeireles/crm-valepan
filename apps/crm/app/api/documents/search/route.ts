import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const conversationId = request.nextUrl.searchParams.get("conversationId")?.trim() || null;
  if (query.length < 2) return NextResponse.json({ results: [] });

  const { data, error } = await supabase.schema("crm").rpc("search_document_insights", {
    p_query: query.slice(0, 200),
    p_conversation_id: conversationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
