import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendZapiDocument, sendZapiImage } from "./send";

describe("Z-API media sending", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ZAPI_BASE_URL = "https://api.z-api.test";
    process.env.ZAPI_INSTANCE_ID = "instance";
    process.env.ZAPI_TOKEN = "token";
    process.env.ZAPI_CLIENT_TOKEN = "client-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("uses the current document endpoint with the file extension and a URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageId: "message-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await sendZapiDocument(
      "(55) 11 99999-9999",
      "https://storage.test/catalogo?token=signed",
      "Catálogo Final.PDF",
    );

    expect(result.providerMessageId).toBe("message-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.z-api.test/instances/instance/token/token/send-document/pdf",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Client-Token": "client-token" }),
        body: JSON.stringify({
          phone: "5511999999999",
          document: "https://storage.test/catalogo?token=signed",
          fileName: "Catálogo Final.PDF",
        }),
      }),
    );
  });

  it("keeps the regular media endpoint when sending a signed image URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await sendZapiImage("5511999999999", "https://storage.test/photo.jpg", "");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.z-api.test/instances/instance/token/token/send-image",
    );
  });
});
