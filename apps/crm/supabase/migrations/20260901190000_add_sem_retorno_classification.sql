-- Adiciona SEM RETORNO como classificação do chat e etapa ativa do funil.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'SEM RETORNO', 70, false
where not exists (
  select 1
  from crm.pipeline_stages
  where upper(trim(name)) = 'SEM RETORNO'
);

update crm.pipeline_stages
set sort_order = 70, is_final = false
where upper(trim(name)) = 'SEM RETORNO';

-- Ordem operacional solicitada para as primeiras colunas do funil e para o
-- seletor de etapa usado na qualificação do lead.
update crm.pipeline_stages ps
set sort_order = requested.sort_order
from (
  values
    ('LEADS', 10),
    ('QUALIFICAÇÃO', 20),
    ('NEGOCIAÇÃO', 30),
    ('ENCAMINHADO PARA DISTRIBUIDOR', 40),
    ('AMOSTRA', 50),
    ('CHATBOT', 60),
    ('SEM RETORNO', 70),
    ('CONVERTIDO', 80)
) as requested(stage_name, sort_order)
where upper(trim(ps.name)) = requested.stage_name;

-- Etapas não listadas continuam disponíveis depois das oito principais.
update crm.pipeline_stages
set sort_order = 100 + sort_order
where upper(trim(name)) not in (
  'LEADS',
  'QUALIFICAÇÃO',
  'NEGOCIAÇÃO',
  'ENCAMINHADO PARA DISTRIBUIDOR',
  'AMOSTRA',
  'CHATBOT',
  'SEM RETORNO',
  'CONVERTIDO'
)
and sort_order < 100;

alter table crm.conversations
  drop constraint if exists conversations_classification_allowed;

alter table crm.conversations
  add constraint conversations_classification_allowed
  check (
    classification is null
    or classification in (
      'CHATBOT',
      'CLIENTE',
      'AMOSTRA',
      'NEGOCIAÇÃO',
      'SEM INTERESSE',
      'ENCAMINHADO PARA O DISTRIBUIDOR',
      'NÃO ATENDEMOS A REGIÃO',
      'NÃO TEMOS O PÃO',
      'NÃO RESPONDE',
      'SEM RETORNO',
      'JÁ É CLIENTE'
    )
  );

create or replace function crm.sync_negotiation_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  target_lead_id uuid;
  target_stage_name text;
  target_stage_id uuid;
begin
  if tg_table_name = 'conversations' then
    target_lead_id := new.lead_id;
    target_stage_name := case upper(trim(coalesce(new.classification, '')))
      when 'CHATBOT' then 'CHATBOT'
      when 'AMOSTRA' then 'AMOSTRA'
      when 'NEGOCIAÇÃO' then 'NEGOCIAÇÃO'
      when 'SEM INTERESSE' then 'SEM INTERESSE'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
      when 'NÃO ATENDEMOS A REGIÃO' then 'NÃO ATENDEMOS A REGIÃO'
      when 'NÃO TEMOS O PÃO' then 'NÃO TEMOS O PÃO'
      when 'NÃO RESPONDE' then 'NÃO RESPONDE'
      when 'SEM RETORNO' then 'SEM RETORNO'
      when 'JÁ É CLIENTE' then 'JÁ É CLIENTE'
      when 'CLIENTE' then 'CONVERTIDO'
      else null
    end;
  elsif tg_table_name = 'leads' then
    if lower(trim(coalesce(new.status, ''))) <> 'em negociação' then
      return new;
    end if;
    target_lead_id := new.id;
    target_stage_name := 'NEGOCIAÇÃO';
  end if;

  if target_lead_id is null or target_stage_name is null then
    return new;
  end if;

  select id into target_stage_id
  from crm.pipeline_stages
  where upper(trim(name)) = target_stage_name
  order by sort_order
  limit 1;

  if target_stage_id is not null then
    update crm.opportunities
    set stage_id = target_stage_id, updated_at = now()
    where lead_id = target_lead_id
      and stage_id <> target_stage_id;
  end if;

  return new;
end;
$$;

commit;
