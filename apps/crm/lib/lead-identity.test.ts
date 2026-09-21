import { describe, expect, it } from "vitest";
import { categoryLabel, categoryLetter } from "./lead-identity";

describe("categoryLetter", () => {
  it("usa a inicial combinada do tipo de cliente", () => {
    expect(categoryLetter("hamburgueria")).toBe("H");
    expect(categoryLetter("distribuidor")).toBe("D");
    expect(categoryLetter("parceiros")).toBe("P");
    expect(categoryLetter("outros")).toBe("O");
    expect(categoryLabel("hamburgueria")).toBe("Hamburgueria");
    expect(categoryLetter("desconhecido")).toBeNull();
  });
});
