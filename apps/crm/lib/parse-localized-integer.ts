/** Ex.: 40000 → "40.000" */
export function formatLocalizedInteger(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

type ParseOk = { ok: true; value: number | null };
type ParseErr = { ok: false; error: string };

function validInt(num: number): ParseOk | ParseErr {
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    return { ok: false, error: "Valor numérico inválido." };
  }
  return { ok: true, value: num };
}

/**
 * Converte texto em inteiro não negativo, aceitando formatação comum no Brasil:
 * `40000`, `40.000`, `1.234.567`, `40,000` (milhar), opcionalmente `30g` (gramatura).
 */
export function parseNullableNonNegativeInt(
  value: string | null | undefined,
  opts?: { allowUnitSuffix?: boolean },
): ParseOk | ParseErr {
  let raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };

  if (opts?.allowUnitSuffix) {
    raw = raw.replace(/\s*g\s*$/i, "").trim();
  }

  raw = raw.replace(/\s/g, "");

  if (/^\d+$/.test(raw)) {
    return validInt(Number.parseInt(raw, 10));
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return validInt(Number.parseInt(raw.replace(/\./g, ""), 10));
  }

  if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    return validInt(Number.parseInt(raw.replace(/,/g, ""), 10));
  }

  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(raw)) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    return validInt(Math.round(Number.parseFloat(normalized)));
  }

  if (/^\d+,\d+$/.test(raw)) {
    return validInt(Math.round(Number.parseFloat(raw.replace(",", "."))));
  }

  const dotParts = raw.split(".");
  if (/^\d+\.\d+$/.test(raw) && dotParts[1]?.length !== 3) {
    return validInt(Math.round(Number.parseFloat(raw)));
  }

  return { ok: false, error: "Use apenas números inteiros positivos." };
}
