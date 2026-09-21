import { describe, expect, it } from "vitest";
import {
  inboxConversationHref,
  pipelineConversationPeekTarget,
} from "./pipeline-conversation-peek";

describe("pipeline conversation peek", () => {
  it("não abre o painel sem conversa vinculada", () => {
    expect(pipelineConversationPeekTarget(null, "Padaria Central")).toBeNull();
    expect(pipelineConversationPeekTarget("   ", "Padaria Central")).toBeNull();
  });

  it("abre o painel no funil com o id da conversa e o nome do card", () => {
    expect(pipelineConversationPeekTarget("  conv-123  ", "  Padaria Central ")).toEqual({
      conversationId: "conv-123",
      personName: "Padaria Central",
    });
  });

  it("usa um nome genérico quando o card não tem identificação", () => {
    expect(pipelineConversationPeekTarget("conv-123", "   ")).toEqual({
      conversationId: "conv-123",
      personName: "Cliente",
    });
  });

  it("monta o deep link do Inbox como saída para o workspace completo", () => {
    expect(inboxConversationHref("conv-123")).toBe("/inbox?cid=conv-123");
    expect(inboxConversationHref("cid with space")).toBe("/inbox?cid=cid%20with%20space");
    expect(inboxConversationHref("  ")).toBe("/inbox");
  });
});
