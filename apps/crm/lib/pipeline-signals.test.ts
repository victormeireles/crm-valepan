import { describe, expect, it } from "vitest";
import {
  cardMatchesPipelineFilters,
  phoneMatchesPipelineRegion,
  type PipelineSignal,
} from "./pipeline-signals";

describe("phoneMatchesPipelineRegion", () => {
  it("reconhece DDD 11 e 21 com ou sem DDI e máscara", () => {
    expect(phoneMatchesPipelineRegion("+55 (11) 99999-8888", "sp")).toBe(true);
    expect(phoneMatchesPipelineRegion("21999998888", "rj")).toBe(true);
    expect(phoneMatchesPipelineRegion("+55 21 99999-8888", "sp")).toBe(false);
  });
});

describe("cardMatchesPipelineFilters", () => {
  const baseCard = {
    personName: "Cliente",
    companyLine: null,
    phone_e164: "+5511999998888",
    title: null,
    ownerId: null,
    signals: [] as PipelineSignal[],
    client_category: "hamburgueria",
    distributor_id: null,
    network_type: null,
  };
  const baseFilters = { ownerUserId: null, signal: null, region: null, clientCategory: null, query: "" } as const;

  it("combina região e categoria", () => {
    expect(cardMatchesPipelineFilters(baseCard, { ...baseFilters, region: "sp", clientCategory: "hamburgueria" })).toBe(true);
    expect(cardMatchesPipelineFilters(baseCard, { ...baseFilters, region: "rj", clientCategory: "hamburgueria" })).toBe(false);
  });

  it("considera vínculo e tipo de rede na classificação de distribuidor", () => {
    expect(cardMatchesPipelineFilters({ ...baseCard, distributor_id: "d1" }, { ...baseFilters, clientCategory: "distribuidor" })).toBe(true);
    expect(cardMatchesPipelineFilters({ ...baseCard, network_type: "distribuidor" }, { ...baseFilters, clientCategory: "distribuidor" })).toBe(true);
  });
});
