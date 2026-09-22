const VIACEP_URL = "https://viacep.com.br/ws";
const TEXT_LIMIT = 180;

const BRAZIL_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

export type LeadAddress = {
  zipCode: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

export type CepLookupAddress = {
  zipCode: string;
  street: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
};

export type CepLookupFailureReason = "invalid" | "not_found" | "unavailable";

export type CepLookupResult =
  | { ok: true; address: CepLookupAddress }
  | { ok: false; reason: CepLookupFailureReason; error: string };

type ViaCepPayload = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

function cleanText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, TEXT_LIMIT);
}

export function parseLeadAddress(input: {
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}): { ok: true; address: LeadAddress } | { ok: false; error: string } {
  const rawZip = String(input.zipCode ?? "").trim();
  let zipCode: string | null = null;
  if (rawZip) {
    zipCode = rawZip.replace(/\D/g, "");
    if (!/^\d{8}$/.test(zipCode) || /^(\d)\1{7}$/.test(zipCode)) {
      return { ok: false, error: "Informe um CEP válido com 8 números." };
    }
  }

  const rawState = String(input.state ?? "").trim().toUpperCase();
  let state: string | null = null;
  if (rawState) {
    if (!BRAZIL_UFS.has(rawState)) {
      return { ok: false, error: "Informe a UF com 2 letras." };
    }
    state = rawState;
  }

  return {
    ok: true,
    address: {
      zipCode,
      street: cleanText(input.street),
      neighborhood: cleanText(input.neighborhood),
      city: cleanText(input.city),
      state,
    },
  };
}

/** Consulta o CEP na ViaCEP. `01001000` entra só com os 8 números. */
export async function lookupCep(
  cep: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CepLookupResult> {
  const parsed = parseLeadAddress({ zipCode: cep });
  if (!parsed.ok) return { ok: false, reason: "invalid", error: parsed.error };
  const zipCode = parsed.address.zipCode;
  if (!zipCode) {
    return { ok: false, reason: "invalid", error: "Informe um CEP válido com 8 números." };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${VIACEP_URL}/${zipCode}/json/`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      error: "Não foi possível consultar o CEP. Tente novamente.",
    };
  }

  if (response.status === 400) {
    return { ok: false, reason: "not_found", error: "CEP não encontrado." };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: "unavailable",
      error: "Não foi possível consultar o CEP. Tente novamente.",
    };
  }

  let payload: ViaCepPayload;
  try {
    payload = (await response.json()) as ViaCepPayload;
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      error: "Não foi possível consultar o CEP. Tente novamente.",
    };
  }
  if (payload.erro) {
    return { ok: false, reason: "not_found", error: "CEP não encontrado." };
  }

  const address = parseLeadAddress({
    zipCode,
    street: payload.logradouro,
    neighborhood: payload.bairro,
    city: payload.localidade,
    state: payload.uf,
  });
  if (!address.ok || !address.address.city || !address.address.state) {
    return {
      ok: false,
      reason: "unavailable",
      error: "A consulta não retornou a cidade deste CEP.",
    };
  }

  return {
    ok: true,
    address: {
      zipCode,
      street: address.address.street,
      neighborhood: address.address.neighborhood,
      city: address.address.city,
      state: address.address.state,
    },
  };
}
