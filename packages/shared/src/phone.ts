/** Normaliza dígitos BR comum (11 dígitos com DDD) para E.164 +55. Retorna null se inválido. */
export function normalizeBrazilPhoneToE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  let d = digits;
  if (d.startsWith("55") && d.length >= 12) {
    return `+${d}`;
  }
  if (d.length === 10 || d.length === 11) {
    return `+55${d}`;
  }
  return null;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}
