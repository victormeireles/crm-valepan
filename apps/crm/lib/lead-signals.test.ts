import { describe, expect, it } from "vitest";
import {
  getCustomerWaitSignal,
  getNextActionSignal,
  getWeeklyBreadCount,
  summarizeWeeklyBreadCountByStage,
} from "./lead-signals";

describe("getCustomerWaitSignal", () => {
  const nowMs = new Date("2026-09-02T15:00:00-03:00").getTime();

  it("distingue cliente esperando de resposta enviada", () => {
    expect(getCustomerWaitSignal({
      lastDirection: "in",
      lastSentAt: "2026-09-02T09:00:00-03:00",
      nowMs,
    })).toEqual({ state: "esperando", label: "Cliente esperando há 6h", elapsed: "6h" });
    expect(getCustomerWaitSignal({
      lastDirection: "out",
      lastSentAt: "2026-08-30T15:00:00-03:00",
      nowMs,
    })).toEqual({ state: "respondido", label: "Você respondeu há 3d", elapsed: "3d" });
  });

  it("lida com conversa sem horário válido", () => {
    expect(getCustomerWaitSignal({ lastDirection: "in", lastSentAt: null, nowMs })).toEqual({
      state: "sem_interacao",
      label: "Sem interação",
      elapsed: null,
    });
  });
});

describe("getWeeklyBreadCount", () => {
  it("usa diretamente a quantidade semanal de pães", () => {
    expect(getWeeklyBreadCount(101)).toBe(101);
    expect(getWeeklyBreadCount(80)).toBe(80);
  });

  it("mantém quantidade desconhecida como null e soma por etapa", () => {
    const items = [
      { stage: "entrada", breads: 900 },
      { stage: "entrada", breads: null },
      { stage: "negociacao", breads: 1_200 },
    ];
    expect(getWeeklyBreadCount(null)).toBeNull();
    expect(summarizeWeeklyBreadCountByStage(items, (item) => item.stage, (item) => item.breads)).toEqual({
      byStage: { entrada: 900, negociacao: 1_200 },
      total: 2_100,
    });
  });
});

describe("getNextActionSignal", () => {
  const nowMs = new Date("2026-09-02T15:00:00-03:00").getTime();

  it.each([
    [null, { state: "sem_acao", label: "Sem follow-up" }],
    ["2026-09-01T12:00:00-03:00", { state: "vencida", label: "Follow-up vencido 01/09" }],
    ["2026-09-02T08:00:00-03:00", { state: "hoje", label: "Follow-up hoje" }],
    ["2026-09-08T08:00:00-03:00", { state: "futura", label: "Follow-up 08/09" }],
  ])("classifica %s", (nextActionAt, expected) => {
    expect(getNextActionSignal(nextActionAt, nowMs)).toEqual(expected);
  });
});
