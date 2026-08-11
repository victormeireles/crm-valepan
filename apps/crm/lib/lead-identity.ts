import type { ClientCategoryValue } from "@/lib/client-categories";
import { isClientCategoryValue } from "@/lib/client-categories";

export const LEAD_NO_NAME_LABEL = "Sem nome";

/** Formata telefones brasileiros armazenados com ou sem o código do país. */
export function formatBrazilPhoneForDisplay(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  const normalized =
    digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;

  if (normalized.length === 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6)}`;
  }
  if (normalized.length === 11) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7)}`;
  }

  return raw;
}

const CATEGORY_LETTER: Record<ClientCategoryValue, string> = {
  hamburgueria: "H",
  distribuidor: "D",
  parceiros: "P",
  outros: "O",
};

const CATEGORY_LABEL_PT: Record<ClientCategoryValue, string> = {
  hamburgueria: "Hamburgueria",
  distribuidor: "Distribuidor",
  parceiros: "Parceiros",
  outros: "Outros",
};

export function categoryLetter(category: string | null | undefined): string | null {
  const c = (category ?? "").trim().toLowerCase();
  if (!isClientCategoryValue(c)) return null;
  return CATEGORY_LETTER[c];
}

export function categoryLabel(category: string | null | undefined): string | null {
  const c = (category ?? "").trim().toLowerCase();
  if (!isClientCategoryValue(c)) return null;
  return CATEGORY_LABEL_PT[c];
}

/** Nome para exibição: trim do contato ou texto neutro (telefone não entra aqui). */
export function displayPersonName(fullName: string | null | undefined): string {
  const t = (fullName ?? "").trim();
  return t.length > 0 ? t : LEAD_NO_NAME_LABEL;
}

/** Nome da empresa: usa somente `companies.name` informado no cadastro. */
export function displayCompanyName(input: {
  companyName: string | null | undefined;
  distributorName: string | null | undefined;
  clientCategory: string | null | undefined;
}): string | null {
  const company = (input.companyName ?? "").trim();
  if (company.length > 0) return company;
  void input.distributorName;
  void input.clientCategory;
  return null;
}

export function normalizedClientCategory(
  raw: string | null | undefined,
): ClientCategoryValue | null {
  const c = (raw ?? "").trim().toLowerCase();
  return isClientCategoryValue(c) ? c : null;
}
