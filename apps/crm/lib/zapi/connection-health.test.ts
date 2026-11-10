import { describe, expect, it } from "vitest";
import { parseZapiInstanceStatus } from "./connection-health";

describe("parseZapiInstanceStatus", () => {
  it("lê connected true/false e campos opcionais", () => {
    expect(
      parseZapiInstanceStatus({
        connected: true,
        error: "You are already connected",
        smartphoneConnected: true,
      }),
    ).toEqual({
      connected: true,
      smartphoneConnected: true,
      error: "You are already connected",
      raw: {
        connected: true,
        error: "You are already connected",
        smartphoneConnected: true,
      },
    });

    expect(
      parseZapiInstanceStatus({
        connected: false,
        error: "You are not connected",
        smartphoneConnected: false,
      })?.connected,
    ).toBe(false);
  });

  it("rejeita payload sem connected booleano", () => {
    expect(parseZapiInstanceStatus(null)).toBeNull();
    expect(parseZapiInstanceStatus({ error: "x" })).toBeNull();
    expect(parseZapiInstanceStatus({ connected: "true" })).toBeNull();
  });
});
