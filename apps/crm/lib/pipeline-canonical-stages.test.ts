import { describe, expect, it } from "vitest";
import {
  canonicalPipelineStageKey,
  displayPipelineStageName,
  findCanonicalPipelineStage,
  isCanonicalFinalStage,
  isCanonicalPipelineStageName,
  isLostPipelineStage,
  selectCanonicalPipelineStages,
  visiblePipelineBoardStages,
} from "./pipeline-canonical-stages";

describe("pipeline canonical stages", () => {
  it("trata ENTRADA como LEADS", () => {
    expect(canonicalPipelineStageKey("entrada")).toBe("LEADS");
    expect(isCanonicalPipelineStageName("ENTRADA")).toBe(true);
    expect(isCanonicalPipelineStageName("CHATBOT")).toBe(false);
  });

  it("mostra nomes curtos no funil", () => {
    expect(displayPipelineStageName("LEADS")).toBe("Novo");
    expect(displayPipelineStageName("ENCAMINHADO PARA DISTRIBUIDOR")).toBe(
      "Encaminhado para distribuidor",
    );
    expect(displayPipelineStageName("CONVERTIDO")).toBe("Cliente");
    expect(displayPipelineStageName("PERDIDO")).toBe("Perdido");
  });

  it("mantém só as 6 etapas canônicas e prefere os nomes canônicos", () => {
    const stages = selectCanonicalPipelineStages([
      { id: "entrada", name: "ENTRADA", sort_order: 1, is_final: false },
      { id: "leads", name: "LEADS", sort_order: 10, is_final: false },
      { id: "chatbot", name: "CHATBOT", sort_order: 60, is_final: false },
      { id: "qualificacao", name: "QUALIFICAÇÃO", sort_order: 20, is_final: false },
      { id: "negociacao", name: "NEGOCIAÇÃO", sort_order: 30, is_final: false },
      {
        id: "encaminhado-com-o",
        name: "ENCAMINHADO PARA O DISTRIBUIDOR",
        sort_order: 35,
        is_final: false,
      },
      {
        id: "encaminhado",
        name: "ENCAMINHADO PARA DISTRIBUIDOR",
        sort_order: 40,
        is_final: false,
      },
      { id: "convertido", name: "CONVERTIDO", sort_order: 80, is_final: true },
      { id: "perdido", name: "PERDIDO", sort_order: 90, is_final: true },
      { id: "amostra", name: "AMOSTRA", sort_order: 50, is_final: false },
    ]);

    expect(stages.map((stage) => stage.name)).toEqual([
      "LEADS",
      "QUALIFICAÇÃO",
      "NEGOCIAÇÃO",
      "ENCAMINHADO PARA DISTRIBUIDOR",
      "CONVERTIDO",
      "PERDIDO",
    ]);
    expect(stages[0]?.id).toBe("leads");
    expect(stages[3]?.id).toBe("encaminhado");
    expect(stages.filter((stage) => stage.is_final).map((stage) => stage.name)).toEqual([
      "CONVERTIDO",
      "PERDIDO",
    ]);
  });

  it("esconde Cliente e Perdido no quadro padrão e reabre pelo filtro", () => {
    const stages = selectCanonicalPipelineStages([
      { id: "leads", name: "LEADS", sort_order: 10, is_final: false },
      { id: "qualificacao", name: "QUALIFICAÇÃO", sort_order: 20, is_final: false },
      { id: "negociacao", name: "NEGOCIAÇÃO", sort_order: 30, is_final: false },
      {
        id: "encaminhado",
        name: "ENCAMINHADO PARA DISTRIBUIDOR",
        sort_order: 40,
        is_final: false,
      },
      { id: "convertido", name: "CONVERTIDO", sort_order: 80, is_final: true },
      { id: "perdido", name: "PERDIDO", sort_order: 90, is_final: true },
    ]);

    expect(visiblePipelineBoardStages(stages, null).map((stage) => stage.name)).toEqual([
      "LEADS",
      "QUALIFICAÇÃO",
      "NEGOCIAÇÃO",
      "ENCAMINHADO PARA DISTRIBUIDOR",
    ]);
    expect(visiblePipelineBoardStages(stages, "perdido").map((stage) => stage.name)).toEqual(["PERDIDO"]);
    expect(findCanonicalPipelineStage(stages, "NEGOCIAÇÃO")?.id).toBe("negociacao");
    expect(isLostPipelineStage("PERDIDO")).toBe(true);
    expect(isCanonicalFinalStage("CONVERTIDO")).toBe(true);
    expect(isCanonicalFinalStage("NEGOCIAÇÃO")).toBe(false);
  });
});
