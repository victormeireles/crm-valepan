import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
export const MAX_WHATSAPP_MEDIA_BYTES = 16 * 1024 * 1024;

export type PrivateMediaKind = "audio" | "document";

function extensionForMime(mimeType: string | null | undefined) {
  const mime = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "audio/ogg" || mime === "audio/opus") return "ogg";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return "m4a";
  if (mime === "audio/wav") return "wav";
  if (mime === "audio/webm") return "webm";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (mime === "application/vnd.ms-excel") return "xls";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return "xlsx";
  }
  if (mime === "application/vnd.ms-powerpoint") return "ppt";
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return "pptx";
  }
  if (mime === "text/plain") return "txt";
  if (mime === "text/csv") return "csv";
  if (mime === "application/zip") return "zip";
  return "bin";
}

function safeExtension(fileName: string | null | undefined, mimeType: string | null | undefined) {
  const fromName = /\.([a-z0-9]{1,10})$/i.exec(fileName?.trim() ?? "")?.[1]?.toLowerCase();
  return fromName || extensionForMime(mimeType);
}

export function mediaStoragePath(input: {
  messageId: string;
  kind: PrivateMediaKind;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const folder = input.kind === "audio" ? "audio" : "documents";
  return `${folder}/${input.messageId}.${safeExtension(input.fileName, input.mimeType)}`;
}

export function audioStoragePath(messageId: string, mimeType?: string | null) {
  return mediaStoragePath({ messageId, kind: "audio", mimeType });
}

export async function storePrivateMedia(input: {
  messageId: string;
  kind: PrivateMediaKind;
  bytes: ArrayBuffer | Uint8Array;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const byteLength = input.bytes.byteLength;
  if (byteLength > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error("Arquivo excede o limite de 16 MB.");
  }

  const path = mediaStoragePath(input);
  const admin = createAdminSupabaseClient();
  const { error } = await admin.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(path, input.bytes, {
      contentType: input.mimeType?.split(";")[0]?.trim() || "application/octet-stream",
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`Falha ao armazenar arquivo: ${error.message}`);

  return { path, sizeBytes: byteLength };
}

export function storePrivateAudio(input: {
  messageId: string;
  bytes: ArrayBuffer | Uint8Array;
  mimeType?: string | null;
}) {
  return storePrivateMedia({ ...input, kind: "audio" });
}

export function dataUrlToBytes(dataUrl: string) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match) throw new Error("Conteúdo de arquivo inválido.");
  const bytes = Buffer.from(match[2], "base64");
  return {
    bytes,
    mimeType: match[1]?.trim() || "application/octet-stream",
  };
}
