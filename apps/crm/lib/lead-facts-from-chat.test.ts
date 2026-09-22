import { describe, expect, it } from "vitest";
import { leadFactPatch, type ChatFacts, type LeadFactSnapshot } from "./lead-facts-from-chat";

const emptyCurrent: LeadFactSnapshot = {
  weeklyBreadConsumption: null,
  zipCode: null,
  street: null,
  neighborhood: null,
  city: null,
  state: null,
  clientCategory: null,
  cnpj: null,
};

const emptyFacts: ChatFacts = {
  volumes: [],
  cep: null,
  city: null,
  state: null,
  clientCategory: null,
  cnpj: null,
};

describe("leadFactPatch", () => {
  it("converte caixa para 288 pães/semana", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: {
          ...emptyFacts,
          volumes: [{ amount: 6, unit: "caixas", period: "semana" }],
        },
        phoneE164: null,
      }),
    ).toEqual({ weeklyBreadConsumption: 288 });
  });

  it("preenche CEP e endereço da ViaCEP só onde a ficha está vazia", () => {
    expect(
      leadFactPatch({
        current: { ...emptyCurrent, street: "Rua Já Existe" },
        facts: { ...emptyFacts, cep: "01310-100" },
        phoneE164: "+5511988887777",
        cepAddress: {
          street: "Avenida Paulista",
          neighborhood: "Bela Vista",
          city: "São Paulo",
          state: "SP",
        },
      }),
    ).toEqual({
      zipCode: "01310100",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    });
  });

  it("grava só o CEP quando não há endereço ViaCEP", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, cep: "01310-100" },
        phoneE164: null,
      }),
    ).toEqual({ zipCode: "01310100" });
  });

  it("grava cidade sem CEP e UF explícita de 2 letras", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, city: "Teresópolis", state: "rj" },
        phoneE164: "+5511988887777",
      }),
    ).toEqual({ city: "Teresópolis", state: "RJ" });
  });

  it("infere UF pelo DDD quando não há cidade nem CEP", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: emptyFacts,
        phoneE164: "+5521999998888",
      }),
    ).toEqual({ state: "RJ" });
  });

  it("não usa DDD para completar UF quando há cidade", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, city: "Campinas" },
        phoneE164: "+5521999998888",
      }),
    ).toEqual({ city: "Campinas" });
  });

  it("aceita categoria já normalizada para hamburgueria", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, clientCategory: "hamburgueria" },
        phoneE164: null,
      }),
    ).toEqual({ clientCategory: "hamburgueria" });
  });

  it("grava CNPJ válido normalizado", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, cnpj: "11.222.333/0001-81" },
        phoneE164: null,
      }),
    ).toEqual({ cnpj: "11222333000181" });
  });

  it("ignora CNPJ inválido e CPF", () => {
    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, cnpj: "11.222.333/0001-00" },
        phoneE164: null,
      }),
    ).toEqual({});

    expect(
      leadFactPatch({
        current: emptyCurrent,
        facts: { ...emptyFacts, cnpj: "529.982.247-25" },
        phoneE164: null,
      }),
    ).toEqual({});
  });

  it("não sobrescreve campo já preenchido", () => {
    expect(
      leadFactPatch({
        current: {
          ...emptyCurrent,
          weeklyBreadConsumption: 100,
          zipCode: "01310100",
          city: "São Paulo",
          state: "SP",
          clientCategory: "distribuidor",
          cnpj: "11222333000181",
        },
        facts: {
          volumes: [{ amount: 6, unit: "caixas", period: "semana" }],
          cep: "20040020",
          city: "Rio de Janeiro",
          state: "RJ",
          clientCategory: "hamburgueria",
          cnpj: "00.000.000/0001-91",
        },
        phoneE164: "+5521999998888",
        cepAddress: {
          street: "Rua Nova",
          neighborhood: "Centro",
          city: "Rio de Janeiro",
          state: "RJ",
        },
      }),
    ).toEqual({});
  });
});
