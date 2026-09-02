import { describe, expect, it } from "vitest";
import {
  getCustomerWaitSignal,
  getNextActionSignal,
  getWeeklyVolumeKg,
  summarizeWeeklyVolumeByStage,
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

describe("getWeeklyVolumeKg", () => {
  it("usa 90 g como peso padrão e arredonda o total", () => {
    expect(getWeeklyVolumeKg(101, null)).toBe(9);
    expect(getWeeklyVolumeKg(80, 75)).toBe(6);
  });

  it("mantém volume desconhecido como null e soma por etapa", () => {
    const items = [
      { stage: "entrada", kg: 9 },
      { stage: "entrada", kg: null },
      { stage: "negociacao", kg: 12 },
    ];
    expect(getWeeklyVolumeKg(null, 90)).toBeNull();
    expect(summarizeWeeklyVolumeByStage(items, (item) => item.stage, (item) => item.kg)).toEqual({
      byStage: { entrada: 9, negociacao: 12 },
      total: 21,
    });
  });
});

describe("getNextActionSignal", () => {
  const nowMs = new Date("2026-09-02T15:00:00-03:00").getTime();

  it.each([
    [null, { state: "sem_acao", label: "Sem próxima ação" }],
    ["2026-09-01T12:00:00-03:00", { state: "vencida", label: "Follow-up vencido 01/09" }],
    ["2026-09-02T08:00:00-03:00", { state: "hoje", label: "Ligar hoje" }],
    ["2026-09-08T08:00:00-03:00", { state: "futura", label: "08/09" }],
  ])("classifica %s", (nextActionAt, expected) => {
    expect(getNextActionSignal(nextActionAt, nowMs)).toEqual(expected);
  });
});
