export const CANONICAL_PIPELINE_STAGE_NAMES = [
  "LEADS",
  "QUALIFICAÇÃO",
  "NEGOCIAÇÃO",
  "ENCAMINHADO PARA DISTRIBUIDOR",
  "CONVERTIDO",
  "PERDIDO",
] as const;

export type CanonicalPipelineStageName = (typeof CANONICAL_PIPELINE_STAGE_NAMES)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_PIPELINE_STAGE_NAMES);
const FINAL_SET = new Set<string>(["CONVERTIDO", "PERDIDO"]);

const DISPLAY_NAME: Record<CanonicalPipelineStageName, string> = {
  LEADS: "Novo",
  QUALIFICAÇÃO: "Qualificação",
  NEGOCIAÇÃO: "Negociação",
  "ENCAMINHADO PARA DISTRIBUIDOR": "Encaminhado para distribuidor",
  CONVERTIDO: "Cliente",
  PERDIDO: "Perdido",
};

export function canonicalPipelineStageKey(name: string): string {
  const key = name.trim().toUpperCase();
  if (key === "ENTRADA") return "LEADS";
  if (key === "ENCAMINHADO PARA O DISTRIBUIDOR") {
    return "ENCAMINHADO PARA DISTRIBUIDOR";
  }
  return key;
}

export function isCanonicalPipelineStageName(name: string): boolean {
  return CANONICAL_SET.has(canonicalPipelineStageKey(name));
}

export function displayPipelineStageName(name: string | null | undefined): string {
  if (!name) return "";
  const key = canonicalPipelineStageKey(name);
  return DISPLAY_NAME[key as CanonicalPipelineStageName] ?? name;
}

export function isCanonicalFinalStage(name: string | null | undefined): boolean {
  return FINAL_SET.has(canonicalPipelineStageKey(name ?? ""));
}

export function isLostPipelineStage(name: string | null | undefined): boolean {
  return canonicalPipelineStageKey(name ?? "") === "PERDIDO";
}

export function findCanonicalPipelineStage<T extends { name: string }>(
  stages: readonly T[],
  key: CanonicalPipelineStageName,
): T | undefined {
  return stages.find((stage) => canonicalPipelineStageKey(stage.name) === key);
}

/** Colunas do kanban: funil aberto, ou só a etapa escolhida no filtro. */
export function visiblePipelineBoardStages<
  T extends { id: string; name: string; is_final: boolean },
>(stages: readonly T[], selectedStageId: string | null): T[] {
  if (selectedStageId) {
    const selected = stages.filter((stage) => stage.id === selectedStageId);
    if (selected.length > 0) return selected;
  }
  return stages.filter((stage) => !stage.is_final);
}

export function selectCanonicalPipelineStages<
  T extends { id: string; name: string; sort_order: number; is_final: boolean },
>(stages: readonly T[]): T[] {
  const byKey = new Map<string, T>();
  for (const stage of stages) {
    const key = canonicalPipelineStageKey(stage.name);
    if (!CANONICAL_SET.has(key)) continue;
    const current = byKey.get(key);
    const prefersCanonicalName = stage.name.trim().toUpperCase() === key;
    if (!current || prefersCanonicalName) {
      byKey.set(key, {
        ...stage,
        name: key,
        sort_order: CANONICAL_PIPELINE_STAGE_NAMES.indexOf(key as CanonicalPipelineStageName) * 10 + 10,
        is_final: FINAL_SET.has(key),
      });
    }
  }
  return CANONICAL_PIPELINE_STAGE_NAMES
    .map((name) => byKey.get(name))
    .filter((stage): stage is T => Boolean(stage));
}
