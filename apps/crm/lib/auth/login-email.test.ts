import { describe, expect, it } from "vitest";
import { normalizeLoginEmail } from "./login-email";

describe("e-mail de login", () => {
  it("aceita o endereço completo e iguala ao formato do cadastro", () => {
    expect(normalizeLoginEmail("  Ana@Valepan.com ")).toBe("ana@valepan.com");
  });

  it("recusa usuário sem domínio", () => {
    expect(() => normalizeLoginEmail("ana")).toThrow(/e-mail completo/);
  });
});
