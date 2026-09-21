import { describe, expect, it } from "vitest";
import {
  lostReasonForInboxClassification,
  pipelineStageForInboxClassification,
} from "./pipeline-stage-for-inbox-classification";

describe("pipelineStageForInboxClassification", () => {
  it("envia chatbot para Novo (LEADS)", () => {
    expect(pipelineStageForInboxClassification("CHATBOT")).toBe("LEADS");
  });

  it("envia sem retorno para Qualificação", () => {
    expect(pipelineStageForInboxClassification("SEM RETORNO")).toBe("QUALIFICAÇÃO");
  });

  it("envia amostra e encaminhado para Negociação", () => {
    expect(pipelineStageForInboxClassification("AMOSTRA")).toBe("NEGOCIAÇÃO");
    expect(pipelineStageForInboxClassification("NEGOCIAÇÃO")).toBe("NEGOCIAÇÃO");
    expect(pipelineStageForInboxClassification("ENCAMINHADO PARA O DISTRIBUIDOR")).toBe("NEGOCIAÇÃO");
  });

  it("envia cliente para Convertido", () => {
    expect(pipelineStageForInboxClassification("JÁ É CLIENTE")).toBe("CONVERTIDO");
    expect(pipelineStageForInboxClassification("CLIENTE")).toBe("CONVERTIDO");
  });

  it("envia perdas para Perdido com motivo", () => {
    expect(pipelineStageForInboxClassification("NÃO INAUGUROU")).toBe("PERDIDO");
    expect(pipelineStageForInboxClassification("SEM PEDIDO MÍNIMO")).toBe("PERDIDO");
    expect(pipelineStageForInboxClassification("SEM INTERESSE")).toBe("PERDIDO");
    expect(lostReasonForInboxClassification("NÃO INAUGUROU")).toBe("Não inaugurou");
    expect(lostReasonForInboxClassification("SEM PEDIDO MÍNIMO")).toBe("Sem pedido mínimo");
    expect(lostReasonForInboxClassification("NÃO RESPONDE")).toBe("Não responde");
  });

  it("não move o funil ao limpar a classificação", () => {
    expect(pipelineStageForInboxClassification(null)).toBeNull();
    expect(lostReasonForInboxClassification("NEGOCIAÇÃO")).toBeNull();
  });
});
