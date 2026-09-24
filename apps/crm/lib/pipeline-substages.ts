import {
  CANONICAL_PIPELINE_STAGE_NAMES,
  canonicalPipelineStageKey,
  isLostPipelineStage,
  type CanonicalPipelineStageName,
} from "@/lib/pipeline-canonical-stages";
import { isPlaceholderDistributorName } from "@/lib/distributors";

export type PipelineSubstageDTO = {
  id: string;
  name: string;
  stage_key: CanonicalPipelineStageName;
  sort_order: number;
  active: boolean;
};

/** Compatível com o Encerrar do funil: motivo de perda é a subetapa de PERDIDO. */
export type LostReasonDTO = PipelineSubstageDTO;

export const SUBSTAGE_NAME_MAX = 80;

export function normalizeSubstageName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isPipelineSubstageStageKey(
  value: string,
): value is CanonicalPipelineStageName {
  return (CANONICAL_PIPELINE_STAGE_NAMES as readonly string[]).includes(
    canonicalPipelineStageKey(value),
  );
}

export function substagesForStageKey(
  items: readonly Pick<PipelineSubstageDTO, "name" | "active" | "stage_key">[],
  stageKey: string | null | undefined,
  current?: string | null,
): string[] {
  const key = canonicalPipelineStageKey(stageKey ?? "");
  const names = items
    .filter((item) => item.active && canonicalPipelineStageKey(item.stage_key) === key)
    .map((item) => item.name);
  const extra = (current ?? "").trim();
  if (extra && !names.includes(extra)) names.unshift(extra);
  return names;
}

export function lostReasonNamesForSelect(
  reasons: readonly Pick<PipelineSubstageDTO, "name" | "active">[],
  current?: string | null,
): string[] {
  const names = reasons.filter((reason) => reason.active).map((reason) => reason.name);
  const extra = (current ?? "").trim();
  if (extra && !names.includes(extra)) names.unshift(extra);
  return names;
}

export function substageIsRequired(stageName: string | null | undefined): boolean {
  return isLostPipelineStage(stageName);
}

function foldSubstageName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function isSampleSubstage(name: string | null | undefined): boolean {
  return foldSubstageName(name).includes("amostra");
}

export function isForwardedToDistributorSubstage(name: string | null | undefined): boolean {
  return foldSubstageName(name) === "encaminhado para o distribuidor";
}

/** No card, a flag de encaminhamento vira o nome do distribuidor quando já houver um alocado. */
export function substageLabelOnCard(
  substage: string | null | undefined,
  distributorName: string | null | undefined,
): string | null {
  const flag = (substage ?? "").trim();
  if (!flag) return null;
  if (!isForwardedToDistributorSubstage(flag)) return flag;
  const name = (distributorName ?? "").trim();
  if (!name || isPlaceholderDistributorName(name)) return flag;
  return name;
}

const CLASSIFICATION_BY_SUBSTAGE: Readonly<Record<string, string>> = {
  chatbot: "CHATBOT",
  "sem retorno": "SEM RETORNO",
  "pediu amostra": "AMOSTRA",
  "recebeu amostra": "AMOSTRA",
  "encaminhado para o distribuidor": "ENCAMINHADO PARA O DISTRIBUIDOR",
  "sem interesse": "SEM INTERESSE",
  "nao atendemos a regiao": "NÃO ATENDEMOS A REGIÃO",
  "nao temos o pao": "NÃO TEMOS O PÃO",
  "nao responde": "NÃO RESPONDE",
  "nao inaugurou": "NÃO INAUGUROU",
  "sem pedido minimo": "SEM PEDIDO MÍNIMO",
};

const FALLBACK_CLASSIFICATION_BY_STAGE: Readonly<Record<CanonicalPipelineStageName, string | null>> = {
  LEADS: "CHATBOT",
  QUALIFICAÇÃO: "SEM RETORNO",
  NEGOCIAÇÃO: "NEGOCIAÇÃO",
  "ENCAMINHADO PARA DISTRIBUIDOR": "ENCAMINHADO PARA O DISTRIBUIDOR",
  CONVERTIDO: "CLIENTE",
  PERDIDO: "SEM INTERESSE",
};

function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function conversationClassificationForStageAndSubstage(
  stageKey: string | null | undefined,
  substage: string | null | undefined,
): string | null {
  const key = canonicalPipelineStageKey(stageKey ?? "");
  if (!(CANONICAL_PIPELINE_STAGE_NAMES as readonly string[]).includes(key)) return null;
  const sub = (substage ?? "").trim();
  if (sub) {
    const mapped = CLASSIFICATION_BY_SUBSTAGE[foldKey(sub)];
    if (mapped) return mapped;
  }
  return FALLBACK_CLASSIFICATION_BY_STAGE[key as CanonicalPipelineStageName] ?? null;
}
