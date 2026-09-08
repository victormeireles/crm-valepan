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

/**
 * Formas numéricas equivalentes para busca de telefones brasileiros.
 *
 * Além de aceitar DDI/máscara, considera a representação histórica do WhatsApp
 * em que celulares brasileiros podem chegar sem o nono dígito após o DDD.
 * Os valores retornados contêm somente números e são seguros para filtros de banco.
 */
export function brazilPhoneSearchVariants(input: string): string[] {
  const digits = input.replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set<string>();
  const addNational = (national: string) => {
    if (!national) return;
    variants.add(national);
    variants.add(`55${national}`);
  };

  variants.add(digits);
  const national =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
  addNational(national);

  if (national.length === 11 && national[2] === "9" && /[6-9]/.test(national[3] ?? "")) {
    addNational(`${national.slice(0, 2)}${national.slice(3)}`);
  } else if (national.length === 10 && /[6-9]/.test(national[2] ?? "")) {
    addNational(`${national.slice(0, 2)}9${national.slice(2)}`);
  } else if (
    national.length === 9 &&
    national[0] === "9" &&
    /[6-9]/.test(national[1] ?? "")
  ) {
    variants.add(national.slice(1));
  } else if (national.length === 8 && /[6-9]/.test(national[0] ?? "")) {
    variants.add(`9${national}`);
  }

  return [...variants].filter((value) => value.length >= 4);
}
