export const INBOX_CLASSIFICATION_OPTIONS = [
  "CHATBOT",
  "CLIENTE",
  "AMOSTRA",
  "NEGOCIAÇÃO",
  "SEM INTERESSE",
  "ENCAMINHADO PARA O DISTRIBUIDOR",
  "NÃO ATENDEMOS A REGIÃO",
  "NÃO TEMOS O PÃO",
  "NÃO RESPONDE",
  "SEM RETORNO",
  "JÁ É CLIENTE",
] as const;

export type InboxClassification = (typeof INBOX_CLASSIFICATION_OPTIONS)[number];

export function isInboxClassification(v: string): v is InboxClassification {
  return (INBOX_CLASSIFICATION_OPTIONS as readonly string[]).includes(v);
}
