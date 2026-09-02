export type QuickReply = { title: string; body: string };

// TODO(fase 2): substituir a constante pela tabela crm.message_templates
// (título, corpo, ativo e ordem), mantendo a interpolação no cliente.
export const QUICK_REPLIES: readonly QuickReply[] = [
  { title: "Tabela de preços", body: "Olá, {{primeiro_nome}}! Vou te enviar nossa tabela de preços atualizada. Se quiser, também posso ajudar a escolher os produtos ideais para o seu negócio." },
  { title: "Enviar amostra", body: "Olá, {{primeiro_nome}}! Podemos organizar o envio de uma amostra para você conhecer a qualidade dos produtos Valepan. Qual é o melhor endereço e horário para receber?" },
  { title: "Prazo de entrega", body: "Olá, {{primeiro_nome}}! Nosso prazo de entrega depende da região e do volume do pedido. Me confirme sua cidade e a quantidade desejada para eu consultar a melhor data." },
  { title: "Pedido mínimo", body: "Olá, {{primeiro_nome}}! Vou confirmar o pedido mínimo disponível para sua região. Você consegue me dizer o volume semanal aproximado do seu negócio?" },
  { title: "Catálogo completo", body: "Olá, {{primeiro_nome}}! Vou te enviar o catálogo completo da Valepan. Se me contar quais produtos procura, também separo uma seleção mais objetiva para você." },
] as const;

export function renderQuickReply(body: string, firstName: string) {
  return body.replaceAll("{{primeiro_nome}}", firstName.trim() || "tudo bem");
}
