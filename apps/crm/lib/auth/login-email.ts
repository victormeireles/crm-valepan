/** Domínio sintético: o Supabase Auth exige e-mail; o login na UI é por usuário. */
export const CRM_LOGIN_EMAIL_DOMAIN = "login.crm.valepan";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/** Converte usuário exibido no formulário no e-mail usado no Auth. */
export function usernameToLoginEmail(username: string): string {
  const n = normalizeUsername(username);
  if (!n) {
    throw new Error("Informe o usuário.");
  }
  if (!/^[a-z0-9._-]+$/.test(n)) {
    throw new Error(
      "Usuário inválido. Use apenas letras minúsculas, números, ponto, _ ou -.",
    );
  }
  return `${n}@${CRM_LOGIN_EMAIL_DOMAIN}`;
}
