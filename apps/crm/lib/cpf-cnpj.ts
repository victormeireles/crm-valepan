/** CNPJ numérico/alfanumérico: algoritmo de DV da Receita Federal (ASCII - 48). */
export function normalizeCpfCnpj(value: string): string {
  return value.toUpperCase().replace(/[.\/\-\s]/g, "");
}

function checkDigit(base: string, cnpj: boolean): string {
  const sum = [...base].reduce((total, character, index) => {
    const weight = cnpj ? (base.length - 1 - index) % 8 + 2 : base.length + 1 - index;
    return total + (character.charCodeAt(0) - 48) * weight;
  }, 0);
  const remainder = sum % 11;
  return String(remainder < 2 ? 0 : 11 - remainder);
}

export function isValidCpfCnpj(value: string): boolean {
  const document = normalizeCpfCnpj(value);
  if (/^(.)\1+$/.test(document)) return false;
  const cpf = /^\d{11}$/.test(document);
  const cnpj = /^[A-Z0-9]{12}\d{2}$/.test(document);
  if (!cpf && !cnpj) return false;
  const base = document.slice(0, -2);
  const first = checkDigit(base, cnpj);
  return document === base + first + checkDigit(base + first, cnpj);
}

export function formatCpfCnpj(value: string): string {
  const document = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  const cnpj = document.length > 11 || /[A-Z]/.test(document);
  const groups = cnpj ? [2, 3, 3, 4, 2] : [3, 3, 3, 2];
  const separators = cnpj ? [".", ".", "/", "-"] : [".", ".", "-"];
  let offset = 0;
  return groups.map((length, index) => {
    const part = document.slice(offset, offset + length);
    offset += length;
    return part ? `${index ? separators[index - 1] : ""}${part}` : "";
  }).join("");
}
