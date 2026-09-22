import { ufFromPhone } from "./brazil-ddd";
import { parseLeadAddress } from "./cep-lookup";
import { isValidCpfCnpj, normalizeCpfCnpj } from "./cpf-cnpj";
import { weeklyBreadCount, type VolumeLine } from "./weekly-bread-volume";

export type ChatFacts = {
  volumes: VolumeLine[];
  cep: string | null;
  city: string | null;
  state: string | null;
  clientCategory: "hamburgueria" | "distribuidor" | "parceiros" | null;
  cnpj: string | null;
};

export type LeadFactSnapshot = {
  weeklyBreadConsumption: number | null;
  zipCode: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  clientCategory: string | null;
  cnpj: string | null;
};

export type LeadFactPatch = {
  weeklyBreadConsumption?: number;
  zipCode?: string;
  street?: string | null;
  neighborhood?: string | null;
  city?: string;
  state?: string;
  clientCategory?: "hamburgueria" | "distribuidor" | "parceiros";
  cnpj?: string;
};

const CATEGORIES = new Set(["hamburgueria", "distribuidor", "parceiros"]);

export function leadFactPatch(input: {
  current: LeadFactSnapshot;
  facts: ChatFacts;
  phoneE164: string | null;
  cepAddress?: { street: string | null; neighborhood: string | null; city: string; state: string } | null;
}): LeadFactPatch {
  const { current, facts, phoneE164, cepAddress } = input;
  const patch: LeadFactPatch = {};

  if (current.weeklyBreadConsumption == null) {
    const volume = weeklyBreadCount(facts.volumes);
    if (volume != null) patch.weeklyBreadConsumption = volume;
  }

  let enteredCep = false;
  if (current.zipCode == null && facts.cep) {
    const parsed = parseLeadAddress({ zipCode: facts.cep });
    if (parsed.ok && parsed.address.zipCode) {
      patch.zipCode = parsed.address.zipCode;
      enteredCep = true;
      if (cepAddress) {
        if (current.street == null) patch.street = cepAddress.street;
        if (current.neighborhood == null) patch.neighborhood = cepAddress.neighborhood;
        if (current.city == null) patch.city = cepAddress.city;
        if (current.state == null) patch.state = cepAddress.state;
      }
    }
  }

  if (!enteredCep && current.city == null) {
    const city = String(facts.city ?? "").trim();
    if (city) {
      patch.city = city;
      if (current.state == null) {
        const state = String(facts.state ?? "").trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(state)) patch.state = state;
      }
    }
  }

  if (
    patch.zipCode == null &&
    patch.city == null &&
    current.zipCode == null &&
    current.city == null &&
    current.state == null
  ) {
    const uf = ufFromPhone(phoneE164);
    if (uf) patch.state = uf;
  }

  if (current.clientCategory == null && facts.clientCategory && CATEGORIES.has(facts.clientCategory)) {
    patch.clientCategory = facts.clientCategory;
  }

  if (current.cnpj == null && facts.cnpj) {
    const document = normalizeCpfCnpj(facts.cnpj);
    if (document.length === 14 && isValidCpfCnpj(document)) {
      patch.cnpj = document;
    }
  }

  return patch;
}
