import {
  canonicalPipelineStageKey,
  type CanonicalPipelineStageName,
} from "@/lib/pipeline-canonical-stages";
import { conversationClassificationForStageAndSubstage } from "@/lib/pipeline-substages";
import type { ChatFacts } from "@/lib/lead-facts-from-chat";
import type { VolumeLine } from "@/lib/weekly-bread-volume";

export const PIPELINE_ADVANCE_BATCH_SIZE = 50;
export const PIPELINE_ADVANCE_MIN_CONFIDENCE = 0.6;
export const PIPELINE_ADVANCE_MESSAGE_LIMIT = 12;
export const PIPELINE_ADVANCE_MODEL_CHUNK = 15;

const FORWARD_STAGES = ["LEADS", "QUALIFICAÇÃO", "NEGOCIAÇÃO", "CONVERTIDO"] as const;
type ForwardStageName = (typeof FORWARD_STAGES)[number];

const CLIENT_CATEGORIES = new Set(["hamburgueria", "distribuidor", "parceiros"]);
const VOLUME_UNITS = new Set(["paes", "caixas"]);
const VOLUME_PERIODS = new Set(["dia", "semana", "mes"]);

export type ConversationReplyState = "inbound_only" | "awaiting_reply" | "customer_replied" | "empty";

export type PipelineSubstageCatalogItem = {
  name: string;
  stage_key: string;
  active?: boolean;
};

export type ModelAdvanceOutput = {
  should_advance: boolean;
  stage: string | null;
  substage: string | null;
  confidence: number;
  rationale: string;
  evidence_quote: string;
  facts: ChatFacts;
};

export function emptyChatFacts(): ChatFacts {
  return {
    volumes: [],
    cep: null,
    city: null,
    state: null,
    clientCategory: null,
    cnpj: null,
  };
}

export type ParsedAdvanceSuggestion = {
  toStageName: ForwardStageName;
  toSubstage: string | null;
  toClassification: string;
  confidence: number;
  rationale: string;
  evidenceQuote: string;
};

export type TranscriptMessage = {
  id: string;
  direction: "in" | "out" | string;
  body: string | null;
  media_kind: string | null;
  event_kind: string | null;
  sent_at: string;
};

export type AdvanceCandidate = {
  opportunityId: string;
  leadId: string;
  conversationId: string;
  stageName: ForwardStageName;
  classification: string | null;
  substage: string | null;
  fingerprint: string;
  lastMessageAt: string | null;
};

export type AutomaticPipelineRule =
  | {
      kind: "apply";
      toStageName: ForwardStageName;
      toSubstage: string;
      toClassification: string;
    }
  | { kind: "mark_analyzed" };

export function pipelineStageRank(name: string | null | undefined): number | null {
  const key = canonicalPipelineStageKey(name ?? "");
  const index = FORWARD_STAGES.indexOf(key as ForwardStageName);
  return index >= 0 ? index : null;
}

export function isForwardPipelineAdvance(
  fromStageName: string | null | undefined,
  toStageName: string | null | undefined,
): boolean {
  const from = pipelineStageRank(fromStageName);
  const to = pipelineStageRank(toStageName);
  if (from == null || to == null) return false;
  return to > from;
}

function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function isForwardStageName(name: string): name is ForwardStageName {
  return pipelineStageRank(name) != null && canonicalPipelineStageKey(name) !== "PERDIDO";
}

function sameSubstage(a: string | null | undefined, b: string | null | undefined): boolean {
  return foldKey(a ?? "") === foldKey(b ?? "");
}

export function conversationReplyState(
  messages: Array<{ direction: string }>,
): ConversationReplyState {
  const live = messages.filter((message) => message.direction === "in" || message.direction === "out");
  if (live.length === 0) return "empty";
  const hasOutbound = live.some((message) => message.direction === "out");
  const last = live[live.length - 1];
  if (!hasOutbound) return "inbound_only";
  if (last?.direction === "out") return "awaiting_reply";
  return "customer_replied";
}

export function pipelineAiAnalyzedAfterMessage(input: {
  direction: string;
  hasPriorOutbound: boolean;
  analyzedBefore: boolean;
}): boolean {
  if (input.direction === "in") return !input.hasPriorOutbound;
  if (input.direction === "out") {
    if (!input.hasPriorOutbound) return true;
    return input.analyzedBefore;
  }
  return input.analyzedBefore;
}

export function automaticPipelineRule(input: {
  replyState: ConversationReplyState;
  currentStageName: string;
  currentSubstage: string | null;
}): AutomaticPipelineRule | null {
  const stage = canonicalPipelineStageKey(input.currentStageName);
  const atLeads = !stage || stage === "LEADS";

  if (input.replyState === "inbound_only") {
    if (atLeads) {
      return {
        kind: "apply",
        toStageName: "LEADS",
        toSubstage: "Chatbot",
        toClassification: "CHATBOT",
      };
    }
    return { kind: "mark_analyzed" };
  }

  if (input.replyState === "awaiting_reply") {
    if (atLeads) {
      return {
        kind: "apply",
        toStageName: "QUALIFICAÇÃO",
        toSubstage: "Sem retorno",
        toClassification: "SEM RETORNO",
      };
    }
    return { kind: "mark_analyzed" };
  }

  return null;
}

export function botFormQualificationRule(input: {
  currentStageName: string;
  currentSubstage: string | null;
  messages: Array<{ direction: string; body: string | null }>;
}): AutomaticPipelineRule | null {
  const stage = canonicalPipelineStageKey(input.currentStageName);
  const atLeads = !stage || stage === "LEADS";
  const atQualification = stage === "QUALIFICAÇÃO";
  if (!atLeads && !atQualification) return null;

  const inbounds = input.messages
    .filter((message) => message.direction === "in")
    .map((message) => (message.body ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (inbounds.length === 0) return null;
  if (inbounds.some(isNegotiationInbound)) return null;
  if (!inbounds.some(isFormSignalInbound)) return null;

  if (atQualification) return { kind: "mark_analyzed" };
  return {
    kind: "apply",
    toStageName: "QUALIFICAÇÃO",
    toSubstage: "Sem retorno",
    toClassification: "SEM RETORNO",
  };
}

function isWebsiteLeadInbound(text: string): boolean {
  return /vim pelo site da valepan/i.test(text);
}

function isNegotiationInbound(text: string): boolean {
  if (isWebsiteLeadInbound(text)) return false;
  const folded = foldKey(text);
  return (
    /\bamostra/.test(folded) ||
    /\b(preco|valores?|tabela de precos?)\b/.test(folded) ||
    /\bja (sou|somos|compro|compramos|e cliente)\b/.test(folded) ||
    /\bencaminhad/.test(folded) ||
    /\bdistribuidor da\b/.test(folded) ||
    /\bpedido minimo\b/.test(folded)
  );
}

function isFormSignalInbound(text: string): boolean {
  if (isWebsiteLeadInbound(text)) return false;
  if (/\b\d{5}-?\d{3}\b/.test(text)) return true;
  const folded = foldKey(text);
  if (
    /\b(hamburgueria|hamburguer|padaria|buffet|restaurante|lanchonete|food ?truck|dark kitchen)\b/.test(
      folded,
    )
  ) {
    return true;
  }
  return /\b\d{1,5}\s*(paes|pao|unidades|sacos|caixas)\b/.test(folded);
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += n) {
    chunks.push(items.slice(index, index + n));
  }
  return chunks;
}

export function resolveCatalogSubstage(
  catalog: readonly PipelineSubstageCatalogItem[],
  stageName: string,
  requested: string | null | undefined,
): string | null {
  const stageKey = canonicalPipelineStageKey(stageName);
  const forStage = catalog.filter(
    (item) => item.active !== false && canonicalPipelineStageKey(item.stage_key) === stageKey,
  );
  const wanted = (requested ?? "").trim();
  if (wanted) {
    const folded = foldKey(wanted);
    return forStage.find((item) => foldKey(item.name) === folded)?.name ?? null;
  }
  if (forStage.length === 1) return forStage[0]?.name ?? null;
  return null;
}

function parseOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseClientCategory(value: unknown): ChatFacts["clientCategory"] {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !CLIENT_CATEGORIES.has(trimmed)) return null;
  return trimmed as ChatFacts["clientCategory"];
}

function parseVolumes(value: unknown): VolumeLine[] {
  if (!Array.isArray(value)) return [];
  const volumes: VolumeLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const unit = typeof row.unit === "string" ? row.unit.trim() : "";
    const period = typeof row.period === "string" ? row.period.trim() : "";
    if (!VOLUME_UNITS.has(unit) || !VOLUME_PERIODS.has(period)) continue;
    volumes.push({
      amount,
      unit: unit as VolumeLine["unit"],
      period: period as VolumeLine["period"],
    });
  }
  return volumes;
}

export function parseChatFacts(value: unknown): ChatFacts {
  if (!value || typeof value !== "object") return emptyChatFacts();
  const row = value as Record<string, unknown>;
  return {
    volumes: parseVolumes(row.volumes),
    cep: parseOptionalText(row.cep),
    city: parseOptionalText(row.city),
    state: parseOptionalText(row.state),
    clientCategory: parseClientCategory(row.client_category ?? row.clientCategory),
    cnpj: parseOptionalText(row.cnpj),
  };
}

export function parseModelAdvanceJson(raw: string): ModelAdvanceOutput | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.should_advance !== "boolean") return null;
  const confidence = typeof row.confidence === "number" ? row.confidence : Number(row.confidence);
  if (!Number.isFinite(confidence)) return null;
  const stage =
    typeof row.stage === "string" && row.stage.trim().length > 0 ? row.stage.trim() : null;
  const substage =
    typeof row.substage === "string" && row.substage.trim().length > 0 ? row.substage.trim() : null;
  return {
    should_advance: row.should_advance,
    stage,
    substage,
    confidence,
    rationale: typeof row.rationale === "string" ? row.rationale : "",
    evidence_quote: typeof row.evidence_quote === "string" ? row.evidence_quote : "",
    facts: parseChatFacts(row.facts),
  };
}

export function parseModelAdvanceBatchJson(raw: string): Map<string, ModelAdvanceOutput> | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const results = (parsed as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const map = new Map<string, ModelAdvanceOutput>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const output = parseModelAdvanceJson(JSON.stringify({
      should_advance: row.should_advance,
      stage: row.stage ?? "",
      substage: row.substage ?? "",
      confidence: row.confidence,
      rationale: row.rationale ?? "",
      evidence_quote: row.evidence_quote ?? "",
      facts: row.facts,
    }));
    if (output) map.set(id, output);
  }
  return map;
}

export function suggestionFromModelOutput(input: {
  currentStageName: string;
  currentSubstage?: string | null;
  catalog: readonly PipelineSubstageCatalogItem[];
  output: ModelAdvanceOutput;
}): ParsedAdvanceSuggestion | null {
  if (!input.output.should_advance) return null;
  if (!Number.isFinite(input.output.confidence) || input.output.confidence < PIPELINE_ADVANCE_MIN_CONFIDENCE) {
    return null;
  }
  const toStageName = canonicalPipelineStageKey(input.output.stage ?? "");
  if (!isForwardStageName(toStageName)) return null;
  const requestedSubstage = input.output.substage;
  const toSubstage = resolveCatalogSubstage(input.catalog, toStageName, requestedSubstage);
  if (requestedSubstage && !toSubstage) return null;
  const toClassification = conversationClassificationForStageAndSubstage(toStageName, toSubstage);
  if (!toClassification) return null;
  const currentStage = canonicalPipelineStageKey(input.currentStageName);
  const sameStage = currentStage === toStageName;
  const substageChanged = !sameSubstage(input.currentSubstage, toSubstage);
  if (!isForwardPipelineAdvance(input.currentStageName, toStageName) && !(sameStage && substageChanged)) {
    return null;
  }
  return {
    toStageName,
    toSubstage,
    toClassification,
    confidence: input.output.confidence,
    rationale: input.output.rationale.trim().slice(0, 280),
    evidenceQuote: input.output.evidence_quote.trim().slice(0, 400),
  };
}

export function formatSubstageCatalogForModel(catalog: readonly PipelineSubstageCatalogItem[]): string {
  const grouped = new Map<string, string[]>();
  for (const item of catalog) {
    if (item.active === false) continue;
    const key = canonicalPipelineStageKey(item.stage_key);
    if (!(FORWARD_STAGES as readonly string[]).includes(key)) continue;
    const list = grouped.get(key) ?? [];
    list.push(item.name);
    grouped.set(key, list);
  }
  return FORWARD_STAGES.map((stage) => {
    const names = grouped.get(stage) ?? [];
    return `${stage}: ${names.length > 0 ? names.join(", ") : "(nenhuma)"}`;
  }).join("\n");
}

function mediaMarker(message: TranscriptMessage): string | null {
  if (message.event_kind === "whatsapp_call") return "[Ligação]";
  switch (message.media_kind) {
    case "audio":
      return "[Áudio]";
    case "image":
      return "[Imagem]";
    case "video":
      return "[Vídeo]";
    case "document":
      return "[Documento]";
    default:
      return null;
  }
}

export function formatConversationTranscriptForModel(messages: TranscriptMessage[]): string {
  return messages
    .map((message) => {
      const direction = message.direction === "out" ? "OUT" : "IN";
      const marker = mediaMarker(message);
      const body = (message.body ?? "").replace(/\s+/g, " ").trim();
      const text = marker ?? (body.length > 0 ? body.slice(0, 280) : "[vazio]");
      return `${direction} ${text}`;
    })
    .join("\n");
}

export function conversationAdvanceFingerprint(input: {
  conversationId: string;
  stageName: string;
  substage: string | null;
  messageIds: string[];
}): string {
  return [
    input.conversationId,
    canonicalPipelineStageKey(input.stageName),
    (input.substage ?? "").trim(),
    ...input.messageIds,
  ].join("|");
}

export function selectAdvanceCandidates(input: {
  opportunities: Array<{ id: string; leadId: string; stageName: string; excluded: boolean }>;
  conversations: Array<{
    id: string;
    leadId: string;
    kind: string;
    classification: string | null;
    substage: string | null;
    lastMessageAt: string | null;
    pipelineAiAnalyzed: boolean;
    replyState: ConversationReplyState;
  }>;
  fingerprints: Record<string, string>;
  existing: Array<{ conversationId: string; status: string; fingerprint: string }>;
  limit: number;
}): AdvanceCandidate[] {
  const opportunityByLead = new Map<string, { id: string; stageName: ForwardStageName }>();
  for (const opportunity of input.opportunities) {
    if (opportunity.excluded) continue;
    if (!isForwardStageName(opportunity.stageName)) continue;
    if (canonicalPipelineStageKey(opportunity.stageName) === "CONVERTIDO") continue;
    opportunityByLead.set(opportunity.leadId, {
      id: opportunity.id,
      stageName: canonicalPipelineStageKey(opportunity.stageName) as ForwardStageName,
    });
  }

  const blocked = new Set<string>();
  for (const row of input.existing) {
    const fingerprint = input.fingerprints[row.conversationId];
    if (!fingerprint) continue;
    if (row.fingerprint === fingerprint && (row.status === "pending" || row.status === "dismissed" || row.status === "accepted")) {
      blocked.add(row.conversationId);
    }
  }

  const candidates: AdvanceCandidate[] = [];
  const sorted = [...input.conversations].sort((a, b) => {
    const aAt = a.lastMessageAt ?? "";
    const bAt = b.lastMessageAt ?? "";
    return bAt.localeCompare(aAt);
  });

  for (const conversation of sorted) {
    if (conversation.kind !== "lead") continue;
    if (conversation.pipelineAiAnalyzed) continue;
    if (conversation.replyState !== "customer_replied") continue;
    const opportunity = opportunityByLead.get(conversation.leadId);
    if (!opportunity) continue;
    if (blocked.has(conversation.id)) continue;
    const fingerprint = input.fingerprints[conversation.id];
    if (!fingerprint) continue;
    candidates.push({
      opportunityId: opportunity.id,
      leadId: conversation.leadId,
      conversationId: conversation.id,
      stageName: opportunity.stageName,
      classification: conversation.classification,
      substage: conversation.substage,
      fingerprint,
      lastMessageAt: conversation.lastMessageAt,
    });
    if (candidates.length >= input.limit) break;
  }

  return candidates;
}

export function evaluateAdvanceAccept(input: {
  currentStageName: string;
  suggestedStageName: string;
  currentSubstage?: string | null;
  suggestedSubstage?: string | null;
}): { action: "accept" } | { action: "expire" } {
  if (isForwardPipelineAdvance(input.currentStageName, input.suggestedStageName)) {
    return { action: "accept" };
  }
  const sameStage =
    isForwardStageName(canonicalPipelineStageKey(input.currentStageName)) &&
    canonicalPipelineStageKey(input.currentStageName) === canonicalPipelineStageKey(input.suggestedStageName);
  if (sameStage && !sameSubstage(input.currentSubstage, input.suggestedSubstage)) {
    return { action: "accept" };
  }
  return { action: "expire" };
}

/** Aceitar só quando o destino confirmado é o da IA. Outro destino encerra a sugestão sem contá-la como acerto. */
export function suggestionResolutionStatus(input: {
  suggestedStageId: string;
  suggestedSubstage: string | null;
  chosenStageId: string;
  chosenSubstage: string | null;
}): "accepted" | "dismissed" {
  const sameStage = input.chosenStageId === input.suggestedStageId;
  const sameSubstage =
    (input.chosenSubstage ?? "").trim() === (input.suggestedSubstage ?? "").trim();
  return sameStage && sameSubstage ? "accepted" : "dismissed";
}

export function isOpenAdvanceStage(name: string | null | undefined): boolean {
  const key = canonicalPipelineStageKey(name ?? "") as CanonicalPipelineStageName | string;
  return key === "LEADS" || key === "QUALIFICAÇÃO" || key === "NEGOCIAÇÃO";
}
