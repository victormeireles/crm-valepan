-- =============================================================================
-- Corrigir direção histórica (in / out) em crm.messages
-- =============================================================================
-- O CRM não grava o JSON original do webhook; por isso não dá para recalcular
-- a direção com 100% de certeza só pela base. Use uma destas abordagens:
--
--   A) Preferido: corrigir só mensagens que você identificou (lista de UUIDs).
--   B) Auditoria: queries abaixo para inspecionar antes de atualizar.
--   C) Avançado: critério por conversa + intervalo de datas (só se tiver a certeza
--      de que todas as linhas nesse critério estão erradas).
--
-- Sempre faça backup ou rode primeiro em transação com ROLLBACK de teste.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Auditoria: totais por conversa (últimas atualizadas)
-- -----------------------------------------------------------------------------
select c.id as conversation_id,
       c.phone_e164,
       count(*) filter (where m.direction = 'in')  as qtd_recebidas,
       count(*) filter (where m.direction = 'out') as qtd_enviadas
from crm.conversations c
left join crm.messages m on m.conversation_id = c.id
group by c.id, c.phone_e164
order by max(c.updated_at) desc nulls last;

-- -----------------------------------------------------------------------------
-- 2) Listar mensagens de UMA conversa (substitua o UUID)
-- -----------------------------------------------------------------------------
-- select m.id,
--        m.direction,
--        m.sent_at,
--        left(coalesce(m.body, ''), 80) as body_preview
-- from crm.messages m
-- where m.conversation_id = 'COLE_AQUI_O_UUID_DA_CONVERSA'
-- order by m.sent_at asc, m.id asc;

-- -----------------------------------------------------------------------------
-- 3) Correção SEGURA por lista de IDs (recomendado)
-- -----------------------------------------------------------------------------
-- Marque como RECEBIDA (in) mensagens que foram gravadas como enviadas por engano:
--
-- begin;
-- update crm.messages
-- set direction = 'in'
-- where id in (
--   'uuid-mensagem-1',
--   'uuid-mensagem-2'
-- );
-- -- Verifique o número de linhas; depois: commit; ou rollback;
--
-- Inverso (marcar como ENVIADA):
-- update crm.messages set direction = 'out' where id in (...);

-- -----------------------------------------------------------------------------
-- 4) Opcional: corrigir todas as mensagens 'out' → 'in' num intervalo de tempo
--     numa conversa (DESTRUTIVO se existirem envios reais no mesmo intervalo)
-- -----------------------------------------------------------------------------
-- Só use se tiver a certeza de que NENHUMA mensagem 'out' naquele período é
-- envio legítimo (ex.: instância de testes só com recebidos mal classificados).
--
-- begin;
-- update crm.messages
-- set direction = 'in'
-- where conversation_id = 'COLE_UUID_CONVERSA'
--   and direction = 'out'
--   and sent_at >= '2026-01-01T00:00:00Z'
--   and sent_at <  '2026-04-17T23:59:59Z';
-- -- commit; ou rollback;

-- -----------------------------------------------------------------------------
-- 5) Atualizar updated_at da conversa após correções (opcional, para ordenação)
-- -----------------------------------------------------------------------------
-- update crm.conversations
-- set updated_at = now()
-- where id = 'COLE_UUID_CONVERSA';
