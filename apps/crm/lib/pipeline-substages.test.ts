import { describe, expect, it } from "vitest";
import {
  conversationClassificationForStageAndSubstage,
  isForwardedToDistributorSubstage,
  substageLabelOnCard,
  substagesForStageKey,
} from "./pipeline-substages";

describe("pipeline substages", () => {
  it("filtra status pela etapa canônica", () => {
    const items = [
      { name: "Pediu amostra", active: true, stage_key: "NEGOCIAÇÃO" as const },
      { name: "Não inaugurou", active: true, stage_key: "PERDIDO" as const },
      { name: "Chatbot", active: false, stage_key: "LEADS" as const },
    ];
    expect(substagesForStageKey(items, "NEGOCIAÇÃO")).toEqual(["Pediu amostra"]);
    expect(substagesForStageKey(items, "PERDIDO")).toEqual(["Não inaugurou"]);
    expect(substagesForStageKey(items, "LEADS", "Chatbot")).toEqual(["Chatbot"]);
  });

  it("traduz etapa+status para a classificação antiga da conversa", () => {
    expect(conversationClassificationForStageAndSubstage("NEGOCIAÇÃO", "Pediu amostra")).toBe("AMOSTRA");
    expect(
      conversationClassificationForStageAndSubstage(
        "ENCAMINHADO PARA DISTRIBUIDOR",
        "Encaminhado para o distribuidor",
      ),
    ).toBe("ENCAMINHADO PARA O DISTRIBUIDOR");
    expect(conversationClassificationForStageAndSubstage("ENCAMINHADO PARA DISTRIBUIDOR", null)).toBe(
      "ENCAMINHADO PARA O DISTRIBUIDOR",
    );
    expect(conversationClassificationForStageAndSubstage("PERDIDO", "Não inaugurou")).toBe("NÃO INAUGUROU");
    expect(conversationClassificationForStageAndSubstage("CONVERTIDO", null)).toBe("CLIENTE");
  });

  it("reconhece o status de encaminhamento ao distribuidor", () => {
    expect(isForwardedToDistributorSubstage("Encaminhado para o distribuidor")).toBe(true);
    expect(isForwardedToDistributorSubstage("ENCAMINHADO PARA O DISTRIBUIDOR")).toBe(true);
    expect(isForwardedToDistributorSubstage("Pediu amostra")).toBe(false);
  });

  it("troca a flag do card pelo distribuidor alocado", () => {
    expect(substageLabelOnCard("Encaminhado para o distribuidor", "DICON")).toBe("DICON");
    expect(substageLabelOnCard("Encaminhado para o distribuidor", null)).toBe(
      "Encaminhado para o distribuidor",
    );
    expect(substageLabelOnCard("Encaminhado para o distribuidor", "PENDENTE CARTEIRA · NOÉ")).toBe(
      "Encaminhado para o distribuidor",
    );
    expect(substageLabelOnCard("Pediu amostra", "DICON")).toBe("Pediu amostra");
  });
});
