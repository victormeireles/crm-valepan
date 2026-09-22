# Sugestões de avanço no funil

**Data:** 2026-09-21  
**Status:** aprovado para implementação

## Objetivo

Sugerir clientes que deveriam estar **mais à frente** no funil do que a etapa/subetapa atual, com revisão humana. Nunca recuar etapa: ligação sem registro no chat não é motivo para voltar status.

## Regras automáticas (sem IA)

- Só o cliente falou: etapa **Novo (LEADS)** / subetapa **Chatbot**. Marca `pipeline_ai_analyzed` para não entrar no job.
- Já respondemos e o cliente ainda não: **Qualificação** / **Sem retorno**. Marca analisado.
- Cliente respondeu depois da gente: desmarca a flag; o job/IA classifica etapa **e** subetapa.

Nova mensagem inbound depois de já termos falado desmarca a flag. O botão Atualizar e o cron só processam conversas com a flag desmarcada.

## Regras da IA

- Só avança etapa ou troca subetapa na mesma etapa. Nunca Perdido.
- Sem evidência no WhatsApp, não sugere.
- Nada muda no funil até Aceitar (exceto as regras automáticas acima).
- Ao aceitar: grava etapa + subetapa via `updateConversationPipelineClassification`.

## Peças

- Coluna `crm.conversations.pipeline_ai_analyzed`
- Tabela `crm.pipeline_advance_suggestions` (`from_substage`, `to_substage`)
- Job em lote, cron diário + botão Atualizar agora (admin/gestão)
- Página `/pipeline/sugestoes`
- Modelo `OPENAI_API_MODEL` (fallback `gpt-5-nano`)
