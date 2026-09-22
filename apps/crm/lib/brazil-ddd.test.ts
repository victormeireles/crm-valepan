import { describe, expect, it } from "vitest";
import { ufFromPhone } from "./brazil-ddd";

describe("ufFromPhone", () => {
  it("lê o DDD depois do +55", () => {
    expect(ufFromPhone("+5521999998888")).toBe("RJ");
    expect(ufFromPhone("+5511988887777")).toBe("SP");
    expect(ufFromPhone("+5548999990000")).toBe("SC");
    expect(ufFromPhone("+5561999990000")).toBe("DF");
  });

  it("aceita o número só com dígitos", () => {
    expect(ufFromPhone("5531988887777")).toBe("MG");
  });

  it("não inventa UF", () => {
    expect(ufFromPhone("+5510999998888")).toBeNull();
    expect(ufFromPhone(null)).toBeNull();
    expect(ufFromPhone("+14155552671")).toBeNull();
  });
});
