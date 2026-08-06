import { WHATSAPP_MEDIA_BUCKET } from "@/lib/media-storage";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { messageId } = await context.params;
  const { data: message, error } = await crmTables(supabase)
    .from("messages")
    .select("media_storage_path, media_mime_type, media_file_name")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message?.media_storage_path) {
    return NextResponse.json({ error: "Áudio não encontrado" }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error: downloadError } = await admin.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .download(message.media_storage_path);
  if (downloadError || !data) {
    return NextResponse.json({ error: "Arquivo indisponível" }, { status: 404 });
  }

  const full = new Uint8Array(await data.arrayBuffer());
  const mime =
    message.media_mime_type?.split(";")[0]?.trim() ||
    data.type ||
    "application/octet-stream";
  const range = request.headers.get("range");
  const baseHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Type": mime,
    "Content-Disposition": `inline; filename="${(message.media_file_name || "arquivo").replaceAll('"', "")}"`,
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), full.byteLength - 1) : full.byteLength - 1;
      if (start <= end && start < full.byteLength) {
        const chunk = full.slice(start, end + 1);
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Length": String(chunk.byteLength),
            "Content-Range": `bytes ${start}-${end}/${full.byteLength}`,
          },
        });
      }
    }
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${full.byteLength}` },
    });
  }

  return new NextResponse(full, {
    headers: { ...baseHeaders, "Content-Length": String(full.byteLength) },
  });
}
