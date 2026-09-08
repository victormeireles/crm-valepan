import { describe, expect, it } from "vitest";
import {
  brazilPhoneSearchVariants,
  isValidE164,
  normalizeBrazilPhoneToE164,
} from "./phone";

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

describe("brazilPhoneSearchVariants", () => {
  it("gera versões com e sem DDI", () => {
    expect(brazilPhoneSearchVariants("(21) 98885-5420")).toEqual(
      expect.arrayContaining(["21988855420", "5521988855420"]),
    );
  });

  it("considera a versão histórica sem o nono dígito", () => {
    expect(brazilPhoneSearchVariants("21 98885-5420")).toEqual(
      expect.arrayContaining(["2188855420", "552188855420"]),
    );
    expect(brazilPhoneSearchVariants("+55 21 8885-5420")).toEqual(
      expect.arrayContaining(["21988855420", "5521988855420"]),
    );
  });

  it("não insere nono dígito em telefone fixo", () => {
    expect(brazilPhoneSearchVariants("(21) 2345-6789")).not.toContain("21923456789");
  });
});
