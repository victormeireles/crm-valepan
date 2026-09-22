import { describe, expect, it } from "vitest";
import { weeklyBreadCount } from "./weekly-bread-volume";

describe("weeklyBreadCount", () => {
  it("mantém pães por semana", () => {
    expect(weeklyBreadCount([{ amount: 600, unit: "paes", period: "semana" }])).toBe(600);
  });

  it("multiplica caixa por 48", () => {
    expect(weeklyBreadCount([{ amount: 6, unit: "caixas", period: "semana" }])).toBe(288);
  });

  it("converte dia e mês para semana", () => {
    expect(weeklyBreadCount([{ amount: 100, unit: "paes", period: "dia" }])).toBe(700);
    expect(weeklyBreadCount([{ amount: 2, unit: "caixas", period: "dia" }])).toBe(672);
    expect(weeklyBreadCount([{ amount: 1000, unit: "paes", period: "mes" }])).toBe(233);
  });

  it("arredonda cada volume mensal antes de somar", () => {
    expect(
      weeklyBreadCount([
        { amount: 1000, unit: "paes", period: "mes" },
        { amount: 1000, unit: "paes", period: "mes" },
      ]),
    ).toBe(466);
  });

  it("soma linhas e arredonda faixa já resolvida pelo chamador", () => {
    expect(
      weeklyBreadCount([
        { amount: 75, unit: "paes", period: "semana" },
        { amount: 15, unit: "paes", period: "semana" },
      ]),
    ).toBe(90);
  });

  it("rejeita quantidade inválida", () => {
    expect(weeklyBreadCount([])).toBeNull();
    expect(weeklyBreadCount([{ amount: 0, unit: "paes", period: "semana" }])).toBeNull();
    expect(weeklyBreadCount([{ amount: -1, unit: "caixas", period: "semana" }])).toBeNull();
  });
});
