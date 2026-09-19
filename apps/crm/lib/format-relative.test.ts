import { describe, expect, it } from "vitest";
import { formatAbsoluteShort, formatIntegerPt } from "./format-relative";

describe("formatAbsoluteShort", () => {
  it("formata no fuso de São Paulo para o servidor e o cliente baterem", () => {
    expect(formatAbsoluteShort("2026-09-19T15:18:00.000Z")).toBe("19/09/2026 12:18");
  });
});

describe("formatIntegerPt", () => {
  it("usa ponto de milhar sem depender do locale do runtime", () => {
    expect(formatIntegerPt(512)).toBe("512");
    expect(formatIntegerPt(1500)).toBe("1.500");
  });
});
