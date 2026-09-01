import { describe, expect, it } from "vitest";
import { pipelineStageForInboxClassification } from "./pipeline-stage-for-inbox-classification";

describe("pipelineStageForInboxClassification", () => {
  it("envia negociação para a etapa NEGOCIAÇÃO", () => {
    expect(pipelineStageForInboxClassification("NEGOCIAÇÃO")).toBe("NEGOCIAÇÃO");
  });

  it("mantém chatbot como uma etapa selecionável separada", () => {
    expect(pipelineStageForInboxClassification("CHATBOT")).toBe("CHATBOT");
  });

  it("trata os nomes divergentes entre classificação e etapa", () => {
    expect(pipelineStageForInboxClassification("ENCAMINHADO PARA O DISTRIBUIDOR")).toBe(
      "ENCAMINHADO PARA DISTRIBUIDOR",
    );
    expect(pipelineStageForInboxClassification("CLIENTE")).toBe("CONVERTIDO");
  });

  it("não move o funil ao limpar a classificação", () => {
    expect(pipelineStageForInboxClassification(null)).toBeNull();
  });
});
