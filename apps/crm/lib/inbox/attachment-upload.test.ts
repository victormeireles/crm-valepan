import { describe, expect, it } from "vitest";
import {
  normalizeAttachmentMetadata,
  outboundAttachmentStoragePath,
} from "./attachment-upload";

describe("attachment upload metadata", () => {
  it("classifies media and builds a private user-scoped path", () => {
    const metadata = normalizeAttachmentMetadata({
      mode: "media",
      fileName: "foto da loja.JPG",
      mimeType: "image/jpeg",
      sizeBytes: 1234,
    });

    expect(metadata.kind).toBe("image");
    expect(
      outboundAttachmentStoragePath({
        userId: "3b52ac0d-5d20-4ec1-8de9-b0a6758843a6",
        messageId: "e1bca9c2-5894-4bc3-a180-dbc3d578c471",
        metadata,
      }),
    ).toBe(
      "images/outbound/3b52ac0d-5d20-4ec1-8de9-b0a6758843a6/e1bca9c2-5894-4bc3-a180-dbc3d578c471.jpg",
    );
  });

  it("rejects a non-media file selected through the media picker", () => {
    expect(() =>
      normalizeAttachmentMetadata({
        mode: "media",
        fileName: "catalogo.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    ).toThrow("foto, um vídeo ou um áudio");
  });

  it("rejects files above the channel limit", () => {
    expect(() =>
      normalizeAttachmentMetadata({
        mode: "document",
        fileName: "catalogo.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100 * 1024 * 1024 + 1,
      }),
    ).toThrow("100 MB");
  });
});
