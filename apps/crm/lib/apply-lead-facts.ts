import { lookupCep } from "@/lib/cep-lookup";
import {
  leadFactPatch,
  type ChatFacts,
  type LeadFactPatch,
} from "@/lib/lead-facts-from-chat";

type CrmClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        single?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
};

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

function leadUpdateFromPatch(patch: LeadFactPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.weeklyBreadConsumption !== undefined) {
    update.weekly_bread_consumption = patch.weeklyBreadConsumption;
  }
  if (patch.zipCode !== undefined) update.zip_code = patch.zipCode;
  if (patch.street !== undefined) update.street = patch.street;
  if (patch.neighborhood !== undefined) update.neighborhood = patch.neighborhood;
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.clientCategory !== undefined) update.client_category = patch.clientCategory;
  return update;
}

export async function applyLeadFacts(
  crm: CrmClient,
  input: { leadId: string; phoneE164: string | null; facts: ChatFacts },
): Promise<{ applied: boolean }> {
  const { data: lead, error: leadError } = await crm
    .from("leads")
    .select(
      "weekly_bread_consumption, zip_code, street, neighborhood, city, state, client_category, company_id, phone_e164",
    )
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead não encontrado.");

  let companyDocument: string | null = null;
  let companyCity: string | null = null;
  let companyState: string | null = null;
  const companyId = typeof lead.company_id === "string" ? lead.company_id : null;

  if (companyId) {
    const { data: company, error: companyError } = await crm
      .from("companies")
      .select("document, city, state")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    companyDocument = typeof company?.document === "string" ? company.document : null;
    companyCity = typeof company?.city === "string" ? company.city : null;
    companyState = typeof company?.state === "string" ? company.state : null;
  }

  const phoneE164 =
    input.phoneE164 ??
    (typeof lead.phone_e164 === "string" ? lead.phone_e164 : null);

  let cepAddress: {
    street: string | null;
    neighborhood: string | null;
    city: string;
    state: string;
  } | null = null;
  let factsForPatch = input.facts;

  const currentZip = typeof lead.zip_code === "string" ? lead.zip_code : null;
  const cepDigits = String(input.facts.cep ?? "").replace(/\D/g, "");
  if (!currentZip && /^\d{8}$/.test(cepDigits)) {
    const lookedUp = await lookupCep(cepDigits);
    if (lookedUp.ok) {
      cepAddress = {
        street: lookedUp.address.street,
        neighborhood: lookedUp.address.neighborhood,
        city: lookedUp.address.city,
        state: lookedUp.address.state,
      };
    } else if (lookedUp.reason === "not_found") {
      // CEP inválido na base: não grava; deixa a cidade do chat seguir sem CEP.
      factsForPatch = { ...input.facts, cep: null };
    }
    // unavailable: grava só o CEP (leadFactPatch sem cepAddress).
  }

  const patch = leadFactPatch({
    current: {
      weeklyBreadConsumption:
        typeof lead.weekly_bread_consumption === "number"
          ? lead.weekly_bread_consumption
          : null,
      zipCode: currentZip,
      street: typeof lead.street === "string" ? lead.street : null,
      neighborhood: typeof lead.neighborhood === "string" ? lead.neighborhood : null,
      city: typeof lead.city === "string" ? lead.city : null,
      state: typeof lead.state === "string" ? lead.state : null,
      clientCategory: typeof lead.client_category === "string" ? lead.client_category : null,
      cnpj: companyDocument,
    },
    facts: factsForPatch,
    phoneE164,
    cepAddress,
  });

  if (Object.keys(patch).length === 0) {
    return { applied: false };
  }

  const leadUpdate = leadUpdateFromPatch(patch);
  let nextCompanyId = companyId;

  const wantsCompanyDocument = patch.cnpj !== undefined;
  const wantsCompanyCity = patch.city !== undefined;
  const wantsCompanyState = patch.state !== undefined;

  if (nextCompanyId && (wantsCompanyDocument || wantsCompanyCity || wantsCompanyState)) {
    const companyUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (wantsCompanyDocument && isBlank(companyDocument)) {
      companyUpdate.document = patch.cnpj;
    }
    if (wantsCompanyCity && isBlank(companyCity)) {
      companyUpdate.city = patch.city;
    }
    if (wantsCompanyState && isBlank(companyState)) {
      companyUpdate.state = patch.state;
    }
    if (Object.keys(companyUpdate).length > 1) {
      const { error } = await crm.from("companies").update(companyUpdate).eq("id", nextCompanyId);
      if (error) throw new Error(error.message);
    }
  } else if (!nextCompanyId && wantsCompanyDocument) {
    const phone = phoneE164 ?? "";
    const { data: inserted, error: insertError } = await crm
      .from("companies")
      .insert({
        name: `Empresa ${phone}`,
        document: patch.cnpj,
        city: patch.city ?? null,
        state: patch.state ?? null,
      })
      .select("id")
      .single();
    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message ?? "Erro ao criar empresa.");
    }
    nextCompanyId = inserted.id;
    leadUpdate.company_id = nextCompanyId;
  }

  const { error: updateError } = await crm.from("leads").update(leadUpdate).eq("id", input.leadId);
  if (updateError) throw new Error(updateError.message);

  return { applied: true };
}
