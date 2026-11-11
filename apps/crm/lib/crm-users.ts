export const CRM_USER_ROLES = ["comercial", "operacao", "gestao", "admin"] as const;

export type CrmUserRole = (typeof CRM_USER_ROLES)[number];

export const CRM_USER_ROLE_LABEL: Record<CrmUserRole, string> = {
  comercial: "Comercial",
  operacao: "Operação",
  gestao: "Gestão",
  admin: "Administrador",
};

export type CrmUserDTO = {
  id: string;
  email: string;
  fullName: string | null;
  role: CrmUserRole | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCrmUserRole(value: string): CrmUserRole | null {
  return CRM_USER_ROLES.find((role) => role === value) ?? null;
}

export function parseCrmUserId(value: string): string | null {
  const id = value.trim().toLowerCase();
  return USER_ID_PATTERN.test(id) ? id : null;
}

export function validateCrmUserIdentity(input: {
  fullName: string;
  email: string;
}): { ok: true; fullName: string; email: string } | { ok: false; error: string } {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (fullName.length < 2 || fullName.length > 80) {
    return { ok: false, error: "Informe o nome com 2 a 80 caracteres." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }

  return { ok: true, fullName, email };
}

export function validateNewCrmUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: string;
}):
  | { ok: true; fullName: string; email: string; password: string; role: CrmUserRole }
  | { ok: false; error: string } {
  const identity = validateCrmUserIdentity(input);
  if (!identity.ok) return identity;

  const password = input.password;
  const role = parseCrmUserRole(input.role);
  if (password.length < 8 || password.length > 72) {
    return { ok: false, error: "A senha precisa ter de 8 a 72 caracteres." };
  }
  if (!role) return { ok: false, error: "Escolha um papel válido." };

  return { ok: true, fullName: identity.fullName, email: identity.email, password, role };
}

/** Impede autoexclusão e a remoção do último administrador. */
export function refuseCrmUserDeletion(input: {
  actorId: string;
  targetId: string;
  targetIsAdmin: boolean;
  adminCount: number;
}): string | null {
  if (input.actorId === input.targetId) return "Você não pode remover a própria conta.";
  if (input.targetIsAdmin && input.adminCount <= 1) {
    return "O CRM precisa manter pelo menos um administrador.";
  }
  return null;
}

export function validateCrmPassword(password: string): { ok: true; password: string } | { ok: false; error: string } {
  if (password.length < 8 || password.length > 72) {
    return { ok: false, error: "A senha precisa ter de 8 a 72 caracteres." };
  }
  return { ok: true, password };
}

/** Impede que o último administrador perca o papel e tranque o cadastro. */
export function wouldRemoveLastAdmin(input: {
  targetIsAdmin: boolean;
  nextRole: CrmUserRole;
  adminCount: number;
}): boolean {
  return input.targetIsAdmin && input.nextRole !== "admin" && input.adminCount <= 1;
}

const ROLE_SORT: Record<CrmUserRole, number> = {
  admin: 0,
  gestao: 1,
  operacao: 2,
  comercial: 3,
};

export function compareCrmUsers(a: CrmUserDTO, b: CrmUserDTO): number {
  const roleDelta = (a.role ? ROLE_SORT[a.role] : 9) - (b.role ? ROLE_SORT[b.role] : 9);
  if (roleDelta !== 0) return roleDelta;
  return (a.fullName || a.email).localeCompare(b.fullName || b.email, "pt-BR");
}
