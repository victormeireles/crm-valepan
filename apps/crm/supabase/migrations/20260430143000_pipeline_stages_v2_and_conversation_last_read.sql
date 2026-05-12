-- Etapas do funil alinhadas ao processo comercial + leitura de conversas no inbox.

begin;

-- 1) Última leitura da conversa no inbox (mensagens inbound após isso = não lidas até nova abertura).
alter table crm.conversations
  add column if not exists last_read_at timestamptz;

comment on column crm.conversations.last_read_at is
  'Quando o usuário CRM abriu esta conversa pela última vez no inbox; inbound com sent_at maior conta como não lido.';

-- Conversas já existentes: consideramos lidas até o momento do último update (evita marcar tudo como não lido).
update crm.conversations
set last_read_at = coalesce(last_read_at, updated_at)
where last_read_at is null;

-- 2) Novos estágios do funil (só insere nomes que ainda não existem).
insert into crm.pipeline_stages (name, sort_order, is_final)
select v.name, v.sort_order, v.is_final
from (
  values
    ('QUALIFICAÇÃO', 10, false),
    ('AMOSTRA', 20, false),
    ('ENCAMINHADO PARA DISTRIBUIDOR', 30, false),
    ('JÁ É CLIENTE', 40, false),
    ('NÃO ATENDEMOS A REGIÃO', 50, false),
    ('NÃO RESPONDE', 60, false),
    ('NÃO TEMOS O PÃO', 70, false),
    ('NEGOCIAÇÃO', 80, false),
    ('SEM INTERESSE', 90, true),
    ('CONVERTIDO', 100, true)
) as v(name, sort_order, is_final)
where not exists (
  select 1 from crm.pipeline_stages ps where ps.name = v.name
);

-- 3) Migrar oportunidades dos nomes antigos para os novos UUIDs.
update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'QUALIFICAÇÃO' limit 1),
    updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name in ('Lead novo', 'Qualificação')
);

update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'AMOSTRA' limit 1),
    updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name in ('Amostra')
);

update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'NEGOCIAÇÃO' limit 1),
    updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name in ('Negociação')
);

update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'CONVERTIDO' limit 1),
    updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name in ('Convertido')
);

update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'SEM INTERESSE' limit 1),
    updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name in ('Perdido')
);

-- Qualquer estágio legado não mapeado acima vai para QUALIFICAÇÃO.
update crm.opportunities o
set stage_id = (select id from crm.pipeline_stages where name = 'QUALIFICAÇÃO' limit 1),
    updated_at = now()
where o.stage_id not in (
  select id from crm.pipeline_stages where name in (
    'QUALIFICAÇÃO',
    'AMOSTRA',
    'ENCAMINHADO PARA DISTRIBUIDOR',
    'JÁ É CLIENTE',
    'NÃO ATENDEMOS A REGIÃO',
    'NÃO RESPONDE',
    'NÃO TEMOS O PÃO',
    'NEGOCIAÇÃO',
    'SEM INTERESSE',
    'CONVERTIDO'
  )
);

-- 4) Remover estágios antigos que já não são usados.
delete from crm.pipeline_stages
where name not in (
  'QUALIFICAÇÃO',
  'AMOSTRA',
  'ENCAMINHADO PARA DISTRIBUIDOR',
  'JÁ É CLIENTE',
  'NÃO ATENDEMOS A REGIÃO',
  'NÃO RESPONDE',
  'NÃO TEMOS O PÃO',
  'NEGOCIAÇÃO',
  'SEM INTERESSE',
  'CONVERTIDO'
);

commit;
