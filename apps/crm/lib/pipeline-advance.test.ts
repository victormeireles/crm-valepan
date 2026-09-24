import { describe, expect, it } from "vitest";
import {
  PIPELINE_ADVANCE_BATCH_SIZE,
  PIPELINE_ADVANCE_MIN_CONFIDENCE,
  automaticPipelineRule,
  botFormQualificationRule,
  chunkItems,
  conversationAdvanceFingerprint,
  conversationReplyState,
  emptyChatFacts,
  evaluateAdvanceAccept,
  suggestionResolutionStatus,
  formatConversationTranscriptForModel,
  isForwardPipelineAdvance,
  parseModelAdvanceBatchJson,
  pipelineAiAnalyzedAfterMessage,
  pipelineStageRank,
  resolveCatalogSubstage,
  selectAdvanceCandidates,
  suggestionFromModelOutput,
} from "./pipeline-advance";

const CATALOG = [
  { name: "Chatbot", stage_key: "LEADS", active: true },
  { name: "Sem retorno", stage_key: "QUALIFICAÇÃO", active: true },
  { name: "Pediu amostra", stage_key: "NEGOCIAÇÃO", active: true },
  { name: "Recebeu amostra", stage_key: "NEGOCIAÇÃO", active: true },
  {
    name: "Encaminhado para o distribuidor",
    stage_key: "ENCAMINHADO PARA DISTRIBUIDOR",
    active: true,
  },
];

describe("pipeline advance ranks", () => {
  it("ordena só o caminho para frente e ignora Perdido", () => {
    expect(pipelineStageRank("LEADS")).toBe(0);
    expect(pipelineStageRank("entrada")).toBe(0);
    expect(pipelineStageRank("QUALIFICAÇÃO")).toBe(1);
    expect(pipelineStageRank("NEGOCIAÇÃO")).toBe(2);
    expect(pipelineStageRank("ENCAMINHADO PARA DISTRIBUIDOR")).toBe(3);
    expect(pipelineStageRank("CONVERTIDO")).toBe(4);
    expect(pipelineStageRank("PERDIDO")).toBeNull();
    expect(pipelineStageRank("AMOSTRA")).toBeNull();
  });

  it("só aceita avanço real de etapa", () => {
    expect(isForwardPipelineAdvance("LEADS", "QUALIFICAÇÃO")).toBe(true);
    expect(isForwardPipelineAdvance("LEADS", "CONVERTIDO")).toBe(true);
    expect(isForwardPipelineAdvance("NEGOCIAÇÃO", "ENCAMINHADO PARA DISTRIBUIDOR")).toBe(true);
    expect(isForwardPipelineAdvance("NEGOCIAÇÃO", "CONVERTIDO")).toBe(true);
    expect(isForwardPipelineAdvance("NEGOCIAÇÃO", "LEADS")).toBe(false);
    expect(isForwardPipelineAdvance("NEGOCIAÇÃO", "NEGOCIAÇÃO")).toBe(false);
    expect(isForwardPipelineAdvance("LEADS", "PERDIDO")).toBe(false);
    expect(isForwardPipelineAdvance("PERDIDO", "NEGOCIAÇÃO")).toBe(false);
  });
});

describe("conversationReplyState", () => {
  it("distingue primeiro contato, à espera de resposta e resposta do cliente", () => {
    expect(conversationReplyState([{ direction: "in" }])).toBe("inbound_only");
    expect(conversationReplyState([{ direction: "in" }, { direction: "in" }])).toBe("inbound_only");
    expect(conversationReplyState([{ direction: "in" }, { direction: "out" }])).toBe("awaiting_reply");
    expect(conversationReplyState([{ direction: "out" }])).toBe("awaiting_reply");
    expect(
      conversationReplyState([{ direction: "in" }, { direction: "out" }, { direction: "in" }]),
    ).toBe("customer_replied");
    expect(conversationReplyState([])).toBe("empty");
  });
});

describe("automaticPipelineRule", () => {
  it("na primeira mensagem do cliente fica em Novo/Chatbot e não chama a IA", () => {
    expect(
      automaticPipelineRule({
        replyState: "inbound_only",
        currentStageName: "LEADS",
        currentSubstage: null,
      }),
    ).toEqual({
      kind: "apply",
      toStageName: "LEADS",
      toSubstage: "Chatbot",
      toClassification: "CHATBOT",
    });
  });

  it("depois da nossa resposta aplica Qualificação/Sem retorno se ainda estiver em Novo", () => {
    expect(
      automaticPipelineRule({
        replyState: "awaiting_reply",
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
      }),
    ).toEqual({
      kind: "apply",
      toStageName: "QUALIFICAÇÃO",
      toSubstage: "Sem retorno",
      toClassification: "SEM RETORNO",
    });
  });

  it("não recua etapa já avançada e deixa a IA só quando o cliente respondeu", () => {
    expect(
      automaticPipelineRule({
        replyState: "inbound_only",
        currentStageName: "NEGOCIAÇÃO",
        currentSubstage: "Pediu amostra",
      }),
    ).toEqual({ kind: "mark_analyzed" });
    expect(
      automaticPipelineRule({
        replyState: "awaiting_reply",
        currentStageName: "QUALIFICAÇÃO",
        currentSubstage: "Sem retorno",
      }),
    ).toEqual({ kind: "mark_analyzed" });
    expect(
      automaticPipelineRule({
        replyState: "customer_replied",
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
      }),
    ).toBeNull();
  });
});

describe("botFormQualificationRule", () => {
  it("classifica CEP/tipo/volume do bot como Qualificação e não manda para a IA", () => {
    expect(
      botFormQualificationRule({
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
        messages: [
          { direction: "in", body: "Olá! Vim pelo site da Valepan e gostaria de um orçamento para: Mini Brioche." },
          { direction: "out", body: "Para adiantar precisamos do tipo de negócio, CEP e média semanal." },
          { direction: "in", body: "Buffet 27536-015 150 pães" },
        ],
      }),
    ).toEqual({
      kind: "apply",
      toStageName: "QUALIFICAÇÃO",
      toSubstage: "Sem retorno",
      toClassification: "SEM RETORNO",
    });
  });

  it("marca analisado se já está em Qualificação só com resposta de formulário", () => {
    expect(
      botFormQualificationRule({
        currentStageName: "QUALIFICAÇÃO",
        currentSubstage: "Sem retorno",
        messages: [
          { direction: "out", body: "Qual o cep da sua hamburgueria?" },
          { direction: "in", body: "12350-000 Igaratá" },
        ],
      }),
    ).toEqual({ kind: "mark_analyzed" });
  });

  it("deixa a IA agir quando o cliente pede amostra, preço ou já é cliente", () => {
    expect(
      botFormQualificationRule({
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
        messages: [
          { direction: "out", body: "Como posso te ajudar?" },
          { direction: "in", body: "Quero uma amostra dos pães" },
        ],
      }),
    ).toBeNull();
    expect(
      botFormQualificationRule({
        currentStageName: "QUALIFICAÇÃO",
        currentSubstage: "Sem retorno",
        messages: [
          { direction: "out", body: "Como posso te ajudar?" },
          { direction: "in", body: "Gostaria de saber os valores dos produtos" },
        ],
      }),
    ).toBeNull();
  });
});

describe("cheap model batch helpers", () => {
  it("parte a fila em blocos e lê o JSON agrupado", () => {
    expect(chunkItems(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    const parsed = parseModelAdvanceBatchJson(
      JSON.stringify({
        results: [
          {
            id: "c1",
            should_advance: true,
            stage: "NEGOCIAÇÃO",
            substage: "Pediu amostra",
            confidence: 0.81,
            rationale: "pediu amostra",
            evidence_quote: "quero amostra",
          },
        ],
      }),
    );
    expect(parsed?.get("c1")).toEqual({
      should_advance: true,
      stage: "NEGOCIAÇÃO",
      substage: "Pediu amostra",
      confidence: 0.81,
      rationale: "pediu amostra",
      evidence_quote: "quero amostra",
      facts: {
        volumes: [],
        cep: null,
        city: null,
        state: null,
        clientCategory: null,
        cnpj: null,
      },
    });
  });

  it("parseia facts do mesmo JSON da classificação", () => {
    const parsed = parseModelAdvanceBatchJson(
      JSON.stringify({
        results: [
          {
            id: "c-facts",
            should_advance: true,
            stage: "QUALIFICAÇÃO",
            substage: "Sem retorno",
            confidence: 0.88,
            rationale: "respondeu formulário",
            evidence_quote: "Hamburgueria 25953-000 Teresópolis 200 pães",
            facts: {
              volumes: [{ amount: 200, unit: "paes", period: "semana" }],
              cep: "25953000",
              city: "Teresópolis",
              state: "RJ",
              client_category: "hamburgueria",
              cnpj: "12345678000199",
            },
          },
        ],
      }),
    );
    expect(parsed?.get("c-facts")).toEqual({
      should_advance: true,
      stage: "QUALIFICAÇÃO",
      substage: "Sem retorno",
      confidence: 0.88,
      rationale: "respondeu formulário",
      evidence_quote: "Hamburgueria 25953-000 Teresópolis 200 pães",
      facts: {
        volumes: [{ amount: 200, unit: "paes", period: "semana" }],
        cep: "25953000",
        city: "Teresópolis",
        state: "RJ",
        clientCategory: "hamburgueria",
        cnpj: "12345678000199",
      },
    });
  });

  it("descarta categoria inválida e linhas de volume inválidas", () => {
    const parsed = parseModelAdvanceBatchJson(
      JSON.stringify({
        results: [
          {
            id: "c-bad",
            should_advance: false,
            stage: "",
            substage: "",
            confidence: 0.5,
            rationale: "sem avanço",
            evidence_quote: "ok",
            facts: {
              volumes: [
                { amount: 100, unit: "paes", period: "semana" },
                { amount: 0, unit: "paes", period: "semana" },
                { amount: -5, unit: "caixas", period: "dia" },
                { amount: 10, unit: "sacos", period: "semana" },
                { amount: 10, unit: "paes", period: "ano" },
              ],
              cep: "",
              city: "",
              state: "",
              client_category: "padaria",
              cnpj: "",
            },
          },
        ],
      }),
    );
    expect(parsed?.get("c-bad")).toEqual({
      should_advance: false,
      stage: null,
      substage: null,
      confidence: 0.5,
      rationale: "sem avanço",
      evidence_quote: "ok",
      facts: {
        volumes: [{ amount: 100, unit: "paes", period: "semana" }],
        cep: null,
        city: null,
        state: null,
        clientCategory: null,
        cnpj: null,
      },
    });
  });
});

describe("pipelineAiAnalyzedAfterMessage", () => {
  it("marca analisado na primeira mensagem e na nossa primeira resposta", () => {
    expect(
      pipelineAiAnalyzedAfterMessage({
        direction: "in",
        hasPriorOutbound: false,
        analyzedBefore: false,
      }),
    ).toBe(true);
    expect(
      pipelineAiAnalyzedAfterMessage({
        direction: "out",
        hasPriorOutbound: false,
        analyzedBefore: true,
      }),
    ).toBe(true);
  });

  it("desmarca só quando o cliente responde depois de já termos falado", () => {
    expect(
      pipelineAiAnalyzedAfterMessage({
        direction: "in",
        hasPriorOutbound: true,
        analyzedBefore: true,
      }),
    ).toBe(false);
    expect(
      pipelineAiAnalyzedAfterMessage({
        direction: "out",
        hasPriorOutbound: true,
        analyzedBefore: false,
      }),
    ).toBe(false);
  });
});

describe("suggestionFromModelOutput", () => {
  it("descarta quando a IA não quer mudar ou a confiança é baixa", () => {
    expect(
      suggestionFromModelOutput({
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
        catalog: CATALOG,
        output: {
          should_advance: false,
          stage: "NEGOCIAÇÃO",
          substage: "Pediu amostra",
          confidence: 0.9,
          rationale: "ainda é bot",
          evidence_quote: "olá",
          facts: emptyChatFacts(),
        },
      }),
    ).toBeNull();
    expect(
      suggestionFromModelOutput({
        currentStageName: "LEADS",
        currentSubstage: "Chatbot",
        catalog: CATALOG,
        output: {
          should_advance: true,
          stage: "NEGOCIAÇÃO",
          substage: "Pediu amostra",
          confidence: PIPELINE_ADVANCE_MIN_CONFIDENCE - 0.01,
          rationale: "pedido",
          evidence_quote: "quero 6 caixas",
          facts: emptyChatFacts(),
        },
      }),
    ).toBeNull();
  });

  it("aceita etapa e subetapa do catálogo e recusa recuo ou perda", () => {
    const forward = suggestionFromModelOutput({
      currentStageName: "LEADS",
      currentSubstage: "Chatbot",
      catalog: CATALOG,
      output: {
        should_advance: true,
        stage: "ENCAMINHADO PARA DISTRIBUIDOR",
        substage: "encaminhado para o distribuidor",
        confidence: 0.86,
        rationale: "passamos para o distribuidor da região",
        evidence_quote: "já encaminhei para o distribuidor",
        facts: emptyChatFacts(),
      },
    });
    expect(forward).toEqual({
      toStageName: "ENCAMINHADO PARA DISTRIBUIDOR",
      toSubstage: "Encaminhado para o distribuidor",
      toClassification: "ENCAMINHADO PARA O DISTRIBUIDOR",
      confidence: 0.86,
      rationale: "passamos para o distribuidor da região",
      evidenceQuote: "já encaminhei para o distribuidor",
    });

    const sameStage = suggestionFromModelOutput({
      currentStageName: "NEGOCIAÇÃO",
      currentSubstage: "Pediu amostra",
      catalog: CATALOG,
      output: {
        should_advance: true,
        stage: "NEGOCIAÇÃO",
        substage: "Recebeu amostra",
        confidence: 0.9,
        rationale: "confirmou que chegou",
        evidence_quote: "a amostra chegou ontem",
        facts: emptyChatFacts(),
      },
    });
    expect(sameStage?.toSubstage).toBe("Recebeu amostra");

    expect(
      suggestionFromModelOutput({
        currentStageName: "NEGOCIAÇÃO",
        currentSubstage: "Pediu amostra",
        catalog: CATALOG,
        output: {
          should_advance: true,
          stage: "QUALIFICAÇÃO",
          substage: "Sem retorno",
          confidence: 0.99,
          rationale: "sumiu",
          evidence_quote: "",
          facts: emptyChatFacts(),
        },
      }),
    ).toBeNull();
  });

  it("resolve a única subetapa da etapa quando a IA omite o nome", () => {
    expect(resolveCatalogSubstage(CATALOG, "QUALIFICAÇÃO", "")).toBe("Sem retorno");
    expect(resolveCatalogSubstage(CATALOG, "CONVERTIDO", "")).toBeNull();
    expect(resolveCatalogSubstage(CATALOG, "NEGOCIAÇÃO", "pediu amostra")).toBe("Pediu amostra");
  });
});

describe("conversation transcript and fingerprint", () => {
  it("marca mídia e ligação sem inventar texto", () => {
    const transcript = formatConversationTranscriptForModel([
      {
        id: "1",
        direction: "in",
        body: "Preciso da troca",
        media_kind: null,
        event_kind: null,
        sent_at: "2026-09-21T13:51:45.000Z",
      },
      {
        id: "2",
        direction: "out",
        body: null,
        media_kind: "audio",
        event_kind: null,
        sent_at: "2026-09-21T13:40:00.000Z",
      },
      {
        id: "3",
        direction: "in",
        body: "Ligação de voz não atendida",
        media_kind: null,
        event_kind: "whatsapp_call",
        sent_at: "2026-09-14T21:21:15.000Z",
      },
    ]);
    expect(transcript).toContain("IN Preciso da troca");
    expect(transcript).toContain("OUT [Áudio]");
    expect(transcript).toContain("IN [Ligação]");
  });

  it("muda o fingerprint quando a etapa, subetapa ou as mensagens mudam", () => {
    const base = conversationAdvanceFingerprint({
      conversationId: "c1",
      stageName: "LEADS",
      substage: "Chatbot",
      messageIds: ["m1", "m2"],
    });
    expect(
      conversationAdvanceFingerprint({
        conversationId: "c1",
        stageName: "LEADS",
        substage: "Chatbot",
        messageIds: ["m1", "m2"],
      }),
    ).toBe(base);
    expect(
      conversationAdvanceFingerprint({
        conversationId: "c1",
        stageName: "QUALIFICAÇÃO",
        substage: "Chatbot",
        messageIds: ["m1", "m2"],
      }),
    ).not.toBe(base);
    expect(
      conversationAdvanceFingerprint({
        conversationId: "c1",
        stageName: "LEADS",
        substage: null,
        messageIds: ["m1", "m2"],
      }),
    ).not.toBe(base);
  });
});

describe("selectAdvanceCandidates", () => {
  it("só manda para a IA leads não analisados em que o cliente já respondeu", () => {
    const selected = selectAdvanceCandidates({
      opportunities: [
        { id: "o1", leadId: "l1", stageName: "LEADS", excluded: false },
        { id: "o2", leadId: "l2", stageName: "PERDIDO", excluded: false },
        { id: "o3", leadId: "l3", stageName: "LEADS", excluded: true },
        { id: "o4", leadId: "l4", stageName: "NEGOCIAÇÃO", excluded: false },
        { id: "o5", leadId: "l5", stageName: "LEADS", excluded: false },
        { id: "o6", leadId: "l6", stageName: "LEADS", excluded: false },
      ],
      conversations: [
        {
          id: "c1",
          leadId: "l1",
          kind: "lead",
          classification: "CHATBOT",
          substage: "Chatbot",
          lastMessageAt: "2026-09-21T12:00:00.000Z",
          pipelineAiAnalyzed: false,
          replyState: "customer_replied",
        },
        {
          id: "c-analyzed",
          leadId: "l5",
          kind: "lead",
          classification: "CHATBOT",
          substage: "Chatbot",
          lastMessageAt: "2026-09-21T13:00:00.000Z",
          pipelineAiAnalyzed: true,
          replyState: "customer_replied",
        },
        {
          id: "c-first",
          leadId: "l6",
          kind: "lead",
          classification: "CHATBOT",
          substage: "Chatbot",
          lastMessageAt: "2026-09-21T14:00:00.000Z",
          pipelineAiAnalyzed: false,
          replyState: "inbound_only",
        },
        {
          id: "c2",
          leadId: "l2",
          kind: "lead",
          classification: null,
          substage: null,
          lastMessageAt: "2026-09-21T12:00:00.000Z",
          pipelineAiAnalyzed: false,
          replyState: "customer_replied",
        },
        {
          id: "c3",
          leadId: "l4",
          kind: "group",
          classification: null,
          substage: null,
          lastMessageAt: "2026-09-21T12:00:00.000Z",
          pipelineAiAnalyzed: false,
          replyState: "customer_replied",
        },
        {
          id: "c4",
          leadId: "l4",
          kind: "lead",
          classification: "NEGOCIAÇÃO",
          substage: "Pediu amostra",
          lastMessageAt: "2026-09-20T12:00:00.000Z",
          pipelineAiAnalyzed: false,
          replyState: "customer_replied",
        },
      ],
      fingerprints: { c1: "fp-new", c4: "fp-same" },
      existing: [{ conversationId: "c4", status: "dismissed", fingerprint: "fp-same" }],
      limit: PIPELINE_ADVANCE_BATCH_SIZE,
    });
    expect(selected.map((row) => row.conversationId)).toEqual(["c1"]);
    expect(selected[0]?.opportunityId).toBe("o1");
  });
});

describe("suggestionResolutionStatus", () => {
  it("aceita o destino da IA e dispensa quando a pessoa escolhe outro", () => {
    expect(
      suggestionResolutionStatus({
        suggestedStageId: "negociacao",
        suggestedSubstage: "Pediu amostra",
        chosenStageId: "negociacao",
        chosenSubstage: "Pediu amostra",
      }),
    ).toBe("accepted");
    expect(
      suggestionResolutionStatus({
        suggestedStageId: "negociacao",
        suggestedSubstage: "Pediu amostra",
        chosenStageId: "qualificacao",
        chosenSubstage: "Pediu amostra",
      }),
    ).toBe("dismissed");
    expect(
      suggestionResolutionStatus({
        suggestedStageId: "negociacao",
        suggestedSubstage: null,
        chosenStageId: "negociacao",
        chosenSubstage: "  ",
      }),
    ).toBe("accepted");
  });
});

describe("evaluateAdvanceAccept", () => {
  it("expira recuo e aceita avanço de etapa ou troca de subetapa", () => {
    expect(
      evaluateAdvanceAccept({
        currentStageName: "CONVERTIDO",
        suggestedStageName: "NEGOCIAÇÃO",
        currentSubstage: null,
        suggestedSubstage: "Pediu amostra",
      }),
    ).toEqual({ action: "expire" });
    expect(
      evaluateAdvanceAccept({
        currentStageName: "LEADS",
        suggestedStageName: "CONVERTIDO",
        currentSubstage: "Chatbot",
        suggestedSubstage: null,
      }),
    ).toEqual({ action: "accept" });
    expect(
      evaluateAdvanceAccept({
        currentStageName: "NEGOCIAÇÃO",
        suggestedStageName: "NEGOCIAÇÃO",
        currentSubstage: "Pediu amostra",
        suggestedSubstage: "Recebeu amostra",
      }),
    ).toEqual({ action: "accept" });
    expect(
      evaluateAdvanceAccept({
        currentStageName: "NEGOCIAÇÃO",
        suggestedStageName: "NEGOCIAÇÃO",
        currentSubstage: "Pediu amostra",
        suggestedSubstage: "Pediu amostra",
      }),
    ).toEqual({ action: "expire" });
  });
});
