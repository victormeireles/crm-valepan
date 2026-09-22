import { describe, expect, it } from "vitest";
import {
  afterFailedLeadFactsWrite,
  resetIdsAfterAiBatchFailure,
  selectFactsOnlyForModel,
  selectQualificationBackfillLeadIds,
} from "./pipeline-advance-job";

describe("afterFailedLeadFactsWrite", () => {
  it("não marca a conversa como analisada quando a ficha falha ao gravar", () => {
    expect(afterFailedLeadFactsWrite({ markedAnalyzedThisRun: false })).toEqual({
      markAnalyzed: false,
      resetAnalyzed: false,
    });
  });

  it("reabre a conversa se a regra automática já tinha marcado analisada nesta rodada", () => {
    expect(afterFailedLeadFactsWrite({ markedAnalyzedThisRun: true })).toEqual({
      markAnalyzed: false,
      resetAnalyzed: true,
    });
  });
});

describe("resetIdsAfterAiBatchFailure", () => {
  it("reabre só as conversas que a regra automática marcou nesta rodada", () => {
    expect(
      resetIdsAfterAiBatchFailure({
        conversationIds: ["a", "b", "c"],
        markedAnalyzedThisRun: new Set(["b", "c", "z"]),
      }),
    ).toEqual(["b", "c"]);
  });
});

describe("selectQualificationBackfillLeadIds", () => {
  const leads = [
    { leadId: "novo", stageName: "LEADS", excluded: false, needsFacts: true },
    { leadId: "qual", stageName: "QUALIFICAÇÃO", excluded: false, needsFacts: true },
    { leadId: "neg", stageName: "Negociação", excluded: false, needsFacts: true },
    { leadId: "cheia", stageName: "NEGOCIAÇÃO", excluded: false, needsFacts: false },
    { leadId: "fora", stageName: "QUALIFICAÇÃO", excluded: true, needsFacts: true },
    { leadId: "cliente", stageName: "CONVERTIDO", excluded: false, needsFacts: true },
  ];

  it("fica em qualificação e negociação com ficha incompleta", () => {
    expect(selectQualificationBackfillLeadIds({ leads, limit: 10 })).toEqual(["qual", "neg"]);
  });

  it("respeita o limite e não repete lead já processado", () => {
    expect(
      selectQualificationBackfillLeadIds({
        leads,
        excludeLeadIds: new Set(["qual"]),
        limit: 1,
      }),
    ).toEqual(["neg"]);
  });
});

describe("selectFactsOnlyForModel", () => {
  it("limita facts-only ao limit e ignora ids já na fila de stage", () => {
    expect(
      selectFactsOnlyForModel({
        factsOnlyConversationIds: ["a", "b", "c", "d", "e"],
        alreadyQueued: new Set(["b"]),
        limit: 2,
      }),
    ).toEqual(["a", "c"]);
  });
});
