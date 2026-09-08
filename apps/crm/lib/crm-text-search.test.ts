import { describe, expect, it } from "vitest";
import { crmRecordMatchesQuery } from "./crm-text-search";

const matches = (stored: string, query: string) =>
  crmRecordMatchesQuery({ texts: [], phones: [stored] }, query);

describe("crmRecordMatchesQuery telefone", () => {
  it("encontra telefone com ou sem DDI e máscara", () => {
    expect(matches("+5521988855420", "(21) 98885-5420")).toBe(true);
    expect(matches("+5521988855420", "98885-5420")).toBe(true);
  });

  it("encontra celulares armazenados com ou sem o nono dígito", () => {
    expect(matches("+552188855420", "21 98885-5420")).toBe(true);
    expect(matches("+5521988855420", "21 8885-5420")).toBe(true);
  });

  it("não confunde telefones diferentes", () => {
    expect(matches("+5521988855420", "21 97774-4319")).toBe(false);
  });
});
