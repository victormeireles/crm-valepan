const PIPELINE_STAGE_BY_CLASSIFICATION: Readonly<Record<string, string>> = {
  CHATBOT: "CHATBOT",
  AMOSTRA: "AMOSTRA",
  NEGOCIAÇÃO: "NEGOCIAÇÃO",
  "SEM INTERESSE": "SEM INTERESSE",
  "ENCAMINHADO PARA O DISTRIBUIDOR": "ENCAMINHADO PARA DISTRIBUIDOR",
  "NÃO ATENDEMOS A REGIÃO": "NÃO ATENDEMOS A REGIÃO",
  "NÃO TEMOS O PÃO": "NÃO TEMOS O PÃO",
  "NÃO RESPONDE": "NÃO RESPONDE",
  "JÁ É CLIENTE": "JÁ É CLIENTE",
  CLIENTE: "CONVERTIDO",
};

export function pipelineStageForInboxClassification(
  classification: string | null,
): string | null {
  if (!classification) return null;
  return PIPELINE_STAGE_BY_CLASSIFICATION[classification.trim().toUpperCase()] ?? null;
}
