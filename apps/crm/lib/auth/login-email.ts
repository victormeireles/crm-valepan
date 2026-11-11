/** Domínio antigo de contas criadas quando o login era por usuário, sem e-mail real. */
export const CRM_LOGIN_EMAIL_DOMAIN = "login.crm.valepan";

const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza o e-mail digitado no login para o mesmo formato gravado no cadastro. */
export function normalizeLoginEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email) {
    throw new Error("Informe o e-mail.");
  }
  if (!LOGIN_EMAIL_PATTERN.test(email)) {
    throw new Error("Informe o e-mail completo, como nome@empresa.com.");
  }
  return email;
}
