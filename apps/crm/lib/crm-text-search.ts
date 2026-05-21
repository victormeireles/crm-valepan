import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";

function normSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Busca por textos livres e telefone (com/sem máscara e DDI). */
export function crmRecordMatchesQuery(
  fields: {
    texts: string[];
    phones?: (string | null | undefined)[];
  },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;

  const qNorm = normSearchText(q);
  const textHay = normSearchText(fields.texts.filter(Boolean).join(" "));
  if (textHay.includes(qNorm)) return true;

  const qDigits = phoneDigits(q);
  if (qDigits.length < 4) return false;

  const phoneHay = (fields.phones ?? [])
    .filter((p): p is string => !!p?.trim())
    .map(phoneDigits)
    .filter(Boolean)
    .join(" ");

  if (phoneHay.includes(qDigits)) return true;

  const normalizedQuery = normalizeBrazilPhoneToE164(q);
  if (normalizedQuery) {
    const fromQuery = phoneDigits(normalizedQuery);
    for (const phone of fields.phones ?? []) {
      if (!phone?.trim()) continue;
      const stored = phoneDigits(phone);
      if (
        stored.length > 0 &&
        (stored === fromQuery || stored.endsWith(fromQuery) || fromQuery.endsWith(stored))
      ) {
        return true;
      }
    }
  }

  return false;
}

export function pipelineCardMatchesQuery(
  card: {
    personName: string;
    companyLine: string | null;
    phone_e164: string | null;
    title: string | null;
  },
  rawQuery: string,
): boolean {
  return crmRecordMatchesQuery(
    {
      texts: [card.personName, card.companyLine ?? "", card.title ?? ""],
      phones: [card.phone_e164, card.title],
    },
    rawQuery,
  );
}

export function leadListRowMatchesQuery(
  row: {
    phone_e164: string;
    contactName: string;
    companyName: string | null;
    distributorName?: string | null;
    city?: string | null;
    document?: string | null;
    status?: string | null;
    source?: string | null;
  },
  rawQuery: string,
): boolean {
  return crmRecordMatchesQuery(
    {
      texts: [
        row.contactName,
        row.companyName ?? "",
        row.distributorName ?? "",
        row.city ?? "",
        row.document ?? "",
        row.status ?? "",
        row.source ?? "",
        row.phone_e164,
      ],
      phones: [row.phone_e164],
    },
    rawQuery,
  );
}
