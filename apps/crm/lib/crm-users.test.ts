import { describe, expect, it } from "vitest";
import {
  compareCrmUsers,
  parseCrmUserRole,
  refuseCrmUserDeletion,
  validateCrmUserIdentity,
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

  it("aceita nome e e-mail de uma conta já cadastrada", () => {
    expect(validateCrmUserIdentity({
      fullName: "  Ana Souza ",
      email: " Ana@Valepan.com ",
    })).toEqual({
      ok: true,
      fullName: "Ana Souza",
      email: "ana@valepan.com",
    });
  });

  it("recusa nome curto e e-mail inválido na edição", () => {
    expect(validateCrmUserIdentity({ fullName: "A", email: "ana@valepan.com" })).toEqual({
      ok: false,
      error: "Informe o nome com 2 a 80 caracteres.",
    });
    expect(validateCrmUserIdentity({ fullName: "Ana Souza", email: "ana" })).toEqual({
      ok: false,
      error: "Informe um e-mail válido.",
    });
  });

  it("impede remover a própria conta e o último administrador", () => {
    expect(refuseCrmUserDeletion({
      actorId: "11111111-1111-4111-8111-111111111111",
      targetId: "11111111-1111-4111-8111-111111111111",
      targetIsAdmin: false,
      adminCount: 2,
    })).toBe("Você não pode remover a própria conta.");

    expect(refuseCrmUserDeletion({
      actorId: "22222222-2222-4222-8222-222222222222",
      targetId: "11111111-1111-4111-8111-111111111111",
      targetIsAdmin: true,
      adminCount: 1,
    })).toBe("O CRM precisa manter pelo menos um administrador.");
  });

  it("permite remover outro usuário quando ainda resta um administrador", () => {
    expect(refuseCrmUserDeletion({
      actorId: "22222222-2222-4222-8222-222222222222",
      targetId: "11111111-1111-4111-8111-111111111111",
      targetIsAdmin: true,
      adminCount: 2,
    })).toBeNull();
    expect(refuseCrmUserDeletion({
      actorId: "22222222-2222-4222-8222-222222222222",
      targetId: "33333333-3333-4333-8333-333333333333",
      targetIsAdmin: false,
      adminCount: 1,
    })).toBeNull();
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
