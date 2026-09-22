import {
  MAX_WHATSAPP_MEDIA_BYTES,
  mediaStoragePath,
  type PrivateMediaKind,
} from "@/lib/media-storage";

export type AttachmentMode = "document" | "media";

export type AttachmentMetadataInput = {
  mode: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentMetadata = {
  mode: AttachmentMode;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: PrivateMediaKind;
  kindLabel: "documento" | "foto" | "vídeo" | "áudio";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAttachmentMetadata(
  input: AttachmentMetadataInput,
): AttachmentMetadata {
  const mode = input.mode.trim().toLowerCase();
  if (mode !== "document" && mode !== "media") {
    throw new Error("Tipo de anexo inválido.");
  }

  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Selecione um arquivo válido para enviar.");
  }
  if (sizeBytes > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error("O WhatsApp aceita arquivos de até 100 MB neste canal.");
  }

  const fileName = input.fileName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
  if (!fileName) throw new Error("O arquivo precisa ter um nome válido.");

  const mimeType =
    input.mimeType.split(";")[0]?.trim().toLowerCase().slice(0, 150) ||
    "application/octet-stream";

  if (mode === "media" && !/^(image|video|audio)\//.test(mimeType)) {
    throw new Error("Selecione uma foto, um vídeo ou um áudio válido.");
  }

  const kind: PrivateMediaKind =
    mode === "document"
      ? "document"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : "image";
  const kindLabel =
    kind === "document"
      ? "documento"
      : kind === "video"
        ? "vídeo"
        : kind === "audio"
          ? "áudio"
          : "foto";

  return { mode, fileName, mimeType, sizeBytes, kind, kindLabel };
}

export function outboundAttachmentStoragePath(input: {
  userId: string;
  messageId: string;
  metadata: AttachmentMetadata;
}) {
  if (!UUID_PATTERN.test(input.userId) || !UUID_PATTERN.test(input.messageId)) {
    throw new Error("Identificador do anexo inválido.");
  }
  return mediaStoragePath({
    messageId: `outbound/${input.userId}/${input.messageId}`,
    kind: input.metadata.kind,
    mimeType: input.metadata.mimeType,
    fileName: input.metadata.fileName,
  });
}
