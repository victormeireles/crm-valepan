import { describe, expect, it } from "vitest";
import { formatCaptureZip, formatLeadSource } from "./lead-capture";

describe("lead-capture helpers", () => {
  it("formata CEP sem eliminar zeros iniciais", () => {
    expect(formatCaptureZip("01310100")).toBe("01310-100");
    expect(formatCaptureZip("01310")).toBe("01310");
  });

  it("rotula origens conhecidas, inclusive histórico do evento iFood", () => {
    expect(formatLeadSource("whatsapp")).toBe("WhatsApp");
    expect(formatLeadSource("manual")).toBe("Manual");
    expect(formatLeadSource("ifood_event")).toBe("Evento iFood");
    expect(formatLeadSource("outro")).toBe("outro");
  });
});
