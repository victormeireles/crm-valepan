import type { ClientCategoryValue } from "@/lib/client-categories";
import { isClientCategoryValue } from "@/lib/client-categories";

export const LEAD_NO_NAME_LABEL = "Sem nome";

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
