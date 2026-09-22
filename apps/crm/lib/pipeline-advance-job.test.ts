import { describe, expect, it } from "vitest";
import { afterFailedLeadFactsWrite } from "./pipeline-advance-job";

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
