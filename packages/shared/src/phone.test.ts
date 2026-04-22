import { describe, expect, it } from "vitest";
import { isValidE164, normalizeBrazilPhoneToE164 } from "./phone";

describe("normalizeBrazilPhoneToE164", () => {
  it("normaliza celular com DDD", () => {
    expect(normalizeBrazilPhoneToE164("(11) 98765-4321")).toBe("+5511987654321");
  });
  it("aceita já com 55", () => {
    expect(normalizeBrazilPhoneToE164("5511987654321")).toBe("+5511987654321");
  });
});

describe("isValidE164", () => {
  it("valida formato E.164", () => {
    expect(isValidE164("+5511987654321")).toBe(true);
    expect(isValidE164("5511")).toBe(false);
  });
});
