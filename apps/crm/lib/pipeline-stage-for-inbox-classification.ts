const PIPELINE_STAGE_BY_CLASSIFICATION: Readonly<Record<string, string>> = {
  CHATBOT: "LEADS",
  AMOSTRA: "NEGOCIAÇÃO",
  NEGOCIAÇÃO: "NEGOCIAÇÃO",
  "SEM INTERESSE": "PERDIDO",
  "ENCAMINHADO PARA O DISTRIBUIDOR": "NEGOCIAÇÃO",
  "NÃO ATENDEMOS A REGIÃO": "PERDIDO",
  "NÃO TEMOS O PÃO": "PERDIDO",
  "NÃO RESPONDE": "PERDIDO",
  "SEM RETORNO": "QUALIFICAÇÃO",
  "JÁ É CLIENTE": "CONVERTIDO",
  "NÃO INAUGUROU": "PERDIDO",
  "SEM PEDIDO MÍNIMO": "PERDIDO",
  CLIENTE: "CONVERTIDO",
};

const LOST_REASON_BY_CLASSIFICATION: Readonly<Record<string, string>> = {
  "SEM INTERESSE": "Sem interesse",
  "NÃO ATENDEMOS A REGIÃO": "Não atendemos a região",
  "NÃO TEMOS O PÃO": "Não temos o pão",
  "NÃO RESPONDE": "Não responde",
  "NÃO INAUGUROU": "Não inaugurou",
  "SEM PEDIDO MÍNIMO": "Sem pedido mínimo",
};

export function pipelineStageForInboxClassification(
  classification: string | null,
): string | null {
  if (!classification) return null;
  return PIPELINE_STAGE_BY_CLASSIFICATION[classification.trim().toUpperCase()] ?? null;
}

export function lostReasonForInboxClassification(
  classification: string | null,
): string | null {
  if (!classification) return null;
  return LOST_REASON_BY_CLASSIFICATION[classification.trim().toUpperCase()] ?? null;
}
