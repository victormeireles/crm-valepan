export function isPhoneSearchQuery(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 4 && trimmed.replace(/[\d\s()+.\-/]/g, "") === "";
}

/** Busca ativa no inbox: telefone (≥4 dígitos) ou texto (≥2 caracteres). */
export function isInboxSearchQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isPhoneSearchQuery(trimmed)) return true;
  return trimmed.length >= 2;
}
