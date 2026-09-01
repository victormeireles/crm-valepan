-- Mantem todas as classificacoes qualificadas do inbox sincronizadas com o funil.
-- Atualiza todas as oportunidades do lead porque dados antigos podem conter mais
-- de uma oportunidade; deixar uma delas em LEADS faz a conversa permanecer em
-- "Para qualificar".

begin;

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
      when 'AMOSTRA' then 'AMOSTRA'
      when 'NEGOCIAÇÃO' then 'NEGOCIAÇÃO'
      when 'SEM INTERESSE' then 'SEM INTERESSE'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
      when 'NÃO ATENDEMOS A REGIÃO' then 'NÃO ATENDEMOS A REGIÃO'
      when 'NÃO TEMOS O PÃO' then 'NÃO TEMOS O PÃO'
      when 'NÃO RESPONDE' then 'NÃO RESPONDE'
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

-- Repara os registros que ja foram classificados. A conversa alterada mais
-- recentemente e a fonte de verdade quando um lead possui mais de uma.
with latest_classification as (
  select distinct on (c.lead_id)
    c.lead_id,
    case upper(trim(coalesce(c.classification, '')))
      when 'AMOSTRA' then 'AMOSTRA'
      when 'NEGOCIAÇÃO' then 'NEGOCIAÇÃO'
      when 'SEM INTERESSE' then 'SEM INTERESSE'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
      when 'NÃO ATENDEMOS A REGIÃO' then 'NÃO ATENDEMOS A REGIÃO'
      when 'NÃO TEMOS O PÃO' then 'NÃO TEMOS O PÃO'
      when 'NÃO RESPONDE' then 'NÃO RESPONDE'
      when 'JÁ É CLIENTE' then 'JÁ É CLIENTE'
      when 'CLIENTE' then 'CONVERTIDO'
      else null
    end as stage_name
  from crm.conversations c
  where c.lead_id is not null
    and c.classification is not null
  order by c.lead_id, c.updated_at desc, c.created_at desc
), target as (
  select lc.lead_id, ps.id as stage_id
  from latest_classification lc
  join crm.pipeline_stages ps on upper(trim(ps.name)) = lc.stage_name
  where lc.stage_name is not null
)
update crm.opportunities o
set stage_id = target.stage_id, updated_at = now()
from target
where o.lead_id = target.lead_id
  and o.stage_id <> target.stage_id;

commit;
