import { describe, expect, it } from "vitest";
import { getZapiConnectionEvent, isZapiDisconnectedError } from "./disconnect-alert";

describe("getZapiConnectionEvent", () => {
  it("detecta DisconnectedCallback e ConnectedCallback", () => {
    expect(getZapiConnectionEvent({ type: "DisconnectedCallback" })).toBe("disconnected");
    expect(getZapiConnectionEvent({ type: "ConnectedCallback" })).toBe("connected");
    expect(getZapiConnectionEvent({ data: { type: "disconnectedCallback" } })).toBe(
      "disconnected",
    );
  });

  it("ignora callbacks de mensagem", () => {
    expect(getZapiConnectionEvent({ type: "ReceivedCallback" })).toBeNull();
    expect(getZapiConnectionEvent({ phone: "5511999999999" })).toBeNull();
  });
});

describe("isZapiDisconnectedError", () => {
  it("reconhece mensagens comuns da Z-API", () => {
    expect(isZapiDisconnectedError(400, "You need to be connected")).toBe(true);
    expect(isZapiDisconnectedError(503, "Instance is not connected")).toBe(true);
    expect(isZapiDisconnectedError(400, "Número desconectado")).toBe(true);
    expect(isZapiDisconnectedError(409, '{"error":"WhatsApp is not connected"}')).toBe(true);
  });

  it("não marca erros genéricos", () => {
    expect(isZapiDisconnectedError(500, "Internal Server Error")).toBe(false);
    expect(isZapiDisconnectedError(404, "Phone not found")).toBe(false);
    expect(isZapiDisconnectedError(400, "")).toBe(false);
  });
});
