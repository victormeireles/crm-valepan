import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLeadFacts } from "./apply-lead-facts";
import type { ChatFacts } from "./lead-facts-from-chat";

type LeadRow = {
  id: string;
  weekly_bread_consumption: number | null;
  zip_code: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  client_category: string | null;
  company_id: string | null;
  phone_e164: string;
};

type CompanyRow = {
  id: string;
  name: string;
  document: string | null;
  city: string | null;
  state: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createFakeCrm(seed: {
  leads: LeadRow[];
  companies: CompanyRow[];
}) {
  const leads = structuredClone(seed.leads);
  const companies = structuredClone(seed.companies);
  let companySeq = 0;

  function from(table: string) {
    if (table === "leads") {
      return {
        select() {
          return {
            eq(_column: string, id: string) {
              return {
                async maybeSingle() {
                  const row = leads.find((lead) => lead.id === id) ?? null;
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              const row = leads.find((lead) => lead.id === id);
              if (!row) return { error: { message: "lead not found" } };
              Object.assign(row, payload);
              return { error: null };
            },
          };
        },
      };
    }

    if (table === "companies") {
      return {
        select() {
          return {
            eq(_column: string, id: string) {
              return {
                async maybeSingle() {
                  const row = companies.find((company) => company.id === id) ?? null;
                  return { data: row, error: null };
                },
                async single() {
                  const row = companies.find((company) => company.id === id) ?? null;
                  return { data: row, error: row ? null : { message: "missing" } };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              const row = companies.find((company) => company.id === id);
              if (!row) return { error: { message: "company not found" } };
              Object.assign(row, payload);
              return { error: null };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  companySeq += 1;
                  const row: CompanyRow = {
                    id: `company-${companySeq}`,
                    name: String(payload.name ?? ""),
                    document: (payload.document as string | null | undefined) ?? null,
                    city: (payload.city as string | null | undefined) ?? null,
                    state: (payload.state as string | null | undefined) ?? null,
                  };
                  companies.push(row);
                  return { data: { id: row.id }, error: null };
                },
              };
            },
          };
        },
      };
    }

    throw new Error(`unexpected table ${table}`);
  }

  return {
    from,
    _state: { leads, companies },
  };
}

const emptyFacts: ChatFacts = {
  volumes: [],
  cep: null,
  city: null,
  state: null,
  clientCategory: null,
  cnpj: null,
};

const emptyLead = (overrides: Partial<LeadRow> = {}): LeadRow => ({
  id: "lead-1",
  weekly_bread_consumption: null,
  zip_code: null,
  street: null,
  neighborhood: null,
  city: null,
  state: null,
  client_category: null,
  company_id: null,
  phone_e164: "+5511988887777",
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("applyLeadFacts", () => {
  it("preenche volume, CEP resolvido e CNPJ em lead vazio", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        logradouro: "Avenida Paulista",
        bairro: "Bela Vista",
        localidade: "São Paulo",
        uf: "SP",
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const crm = createFakeCrm({ leads: [emptyLead()], companies: [] });
    const result = await applyLeadFacts(crm as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        volumes: [{ amount: 6, unit: "caixas", period: "semana" }],
        cep: "01310-100",
        cnpj: "11.222.333/0001-81",
      },
    });

    expect(result).toEqual({ applied: true });
    expect(crm._state.leads[0]).toMatchObject({
      weekly_bread_consumption: 288,
      zip_code: "01310100",
      street: "Avenida Paulista",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      company_id: "company-1",
    });
    expect(crm._state.companies[0]).toMatchObject({
      name: "Empresa +5511988887777",
      document: "11222333000181",
    });
  });

  it("não altera volume já preenchido", async () => {
    const crm = createFakeCrm({
      leads: [emptyLead({ weekly_bread_consumption: 100, state: "SP" })],
      companies: [],
    });

    await applyLeadFacts(crm as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        volumes: [{ amount: 6, unit: "caixas", period: "semana" }],
      },
    });

    expect(crm._state.leads[0]?.weekly_bread_consumption).toBe(100);
  });

  it("grava o CEP quando a ViaCEP está indisponível e segue com o restante", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchImpl);

    const crm = createFakeCrm({ leads: [emptyLead()], companies: [] });
    const result = await applyLeadFacts(crm as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        volumes: [{ amount: 600, unit: "paes", period: "semana" }],
        cep: "01310100",
        cnpj: "11.222.333/0001-81",
      },
    });

    expect(result).toEqual({ applied: true });
    expect(crm._state.leads[0]).toMatchObject({
      weekly_bread_consumption: 600,
      zip_code: "01310100",
      street: null,
      neighborhood: null,
      city: null,
      company_id: "company-1",
    });
    expect(crm._state.companies[0]?.document).toBe("11222333000181");
  });

  it("não grava CEP inexistente e deixa a cidade do chat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ erro: true }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const crm = createFakeCrm({ leads: [emptyLead()], companies: [] });
    const result = await applyLeadFacts(crm as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        cep: "12345678",
        city: "Teresópolis",
        state: "RJ",
      },
    });

    expect(result).toEqual({ applied: true });
    expect(crm._state.leads[0]).toMatchObject({
      zip_code: null,
      city: "Teresópolis",
      state: "RJ",
    });
  });

  it("preenche document vazio da empresa existente e não sobrescreve o preenchido", async () => {
    const crmEmptyDoc = createFakeCrm({
      leads: [emptyLead({ company_id: "company-1" })],
      companies: [{
        id: "company-1",
        name: "Já Existe",
        document: null,
        city: null,
        state: null,
      }],
    });
    await applyLeadFacts(crmEmptyDoc as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        cnpj: "11.222.333/0001-81",
      },
    });
    expect(crmEmptyDoc._state.companies[0]?.document).toBe("11222333000181");
    expect(crmEmptyDoc._state.leads[0]?.company_id).toBe("company-1");

    const crmFilledDoc = createFakeCrm({
      leads: [emptyLead({ company_id: "company-1" })],
      companies: [{
        id: "company-1",
        name: "Já Existe",
        document: "00000000000191",
        city: null,
        state: null,
      }],
    });
    await applyLeadFacts(crmFilledDoc as never, {
      leadId: "lead-1",
      phoneE164: "+5511988887777",
      facts: {
        ...emptyFacts,
        cnpj: "11.222.333/0001-81",
      },
    });
    expect(crmFilledDoc._state.companies[0]?.document).toBe("00000000000191");
  });
});
