import { describe, expect, it } from "vitest";
import {
  afterFailedLeadFactsWrite,
  resetIdsAfterAiBatchFailure,
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
