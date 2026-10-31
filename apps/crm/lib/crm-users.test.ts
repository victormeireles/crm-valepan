import { describe, expect, it } from "vitest";
import {
  compareCrmUsers,
  parseCrmUserRole,
  validateNewCrmUser,
  wouldRemoveLastAdmin,
} from "./crm-users";

describe("cadastro de usuários do CRM", () => {
  it("aceita um comercial novo e recusa papel fora da lista", () => {
    expect(parseCrmUserRole("admin")).toBe("admin");
    expect(parseCrmUserRole("owner")).toBeNull();

    const created = validateNewCrmUser({
      fullName: "  Ana Souza ",
      email: " Ana@Valepan.com ",
      password: "senha-inicial",
      role: "comercial",
    });

    expect(created).toEqual({
      ok: true,
      fullName: "Ana Souza",
      email: "ana@valepan.com",
      password: "senha-inicial",
      role: "comercial",
    });
    expect(validateNewCrmUser({
      fullName: "Ana Souza",
      email: "ana@valepan.com",
      password: "senha-inicial",
      role: "superadmin",
    }).ok).toBe(false);
  });

  it("não deixa a senha curta nem o e-mail solto passar", () => {
    expect(validateNewCrmUser({
      fullName: "Ana",
      email: "ana",
      password: "curta",
      role: "comercial",
    }).ok).toBe(false);
  });

  it("preserva o último administrador", () => {
    expect(wouldRemoveLastAdmin({
      targetIsAdmin: true,
      nextRole: "comercial",
      adminCount: 1,
    })).toBe(true);
    expect(wouldRemoveLastAdmin({
      targetIsAdmin: true,
      nextRole: "comercial",
      adminCount: 2,
    })).toBe(false);
    expect(wouldRemoveLastAdmin({
      targetIsAdmin: false,
      nextRole: "admin",
      adminCount: 1,
    })).toBe(false);
  });

  it("ordena administradores antes de quem ainda não tem acesso", () => {
    const ordered = [
      { id: "2", email: "b@valepan.com", fullName: "Bruno", role: "comercial" as const },
      { id: "3", email: "c@valepan.com", fullName: null, role: null },
      { id: "1", email: "a@valepan.com", fullName: "Ana", role: "admin" as const },
    ].sort(compareCrmUsers);

    expect(ordered.map((user) => user.id)).toEqual(["1", "2", "3"]);
  });
});
