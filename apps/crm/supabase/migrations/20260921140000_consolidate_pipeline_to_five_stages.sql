-- Consolida o funil em 5 etapas: Novo (LEADS), Qualificação, Negociação, Cliente, Perdido.
-- Etapas antigas permanecem vazias para rollback; a UI deixa de exibi-las.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'CONVERTIDO', 80, true
where not exists (
  select 1 from crm.pipeline_stages where upper(trim(name)) = 'CONVERTIDO'
);

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'PERDIDO', 90, true
where not exists (
  select 1 from crm.pipeline_stages where upper(trim(name)) = 'PERDIDO'
);

update crm.pipeline_stages
set is_final = true
where upper(trim(name)) in ('CONVERTIDO', 'PERDIDO');

update crm.pipeline_stages
set is_final = false
where upper(trim(name)) in ('LEADS', 'QUALIFICAÇÃO', 'NEGOCIAÇÃO');

with ids as (
  select
    (select id from crm.pipeline_stages where upper(trim(name)) = 'LEADS' order by sort_order limit 1) as leads_id,
    (select id from crm.pipeline_stages where upper(trim(name)) = 'QUALIFICAÇÃO' order by sort_order limit 1) as qualificacao_id,
    (select id from crm.pipeline_stages where upper(trim(name)) = 'NEGOCIAÇÃO' order by sort_order limit 1) as negociacao_id,
    (select id from crm.pipeline_stages where upper(trim(name)) = 'CONVERTIDO' order by sort_order limit 1) as convertido_id,
    (select id from crm.pipeline_stages where upper(trim(name)) = 'PERDIDO' order by sort_order limit 1) as perdido_id
)
update crm.opportunities o
set
  stage_id = case upper(trim(ps.name))
    when 'CHATBOT' then ids.leads_id
    when 'ENTRADA' then ids.leads_id
    when 'SEM RETORNO' then ids.qualificacao_id
    when 'AMOSTRA' then ids.negociacao_id
    when 'ENCAMINHADO PARA DISTRIBUIDOR' then ids.negociacao_id
    when 'JÁ É CLIENTE' then ids.convertido_id
    when 'CLIENTE' then ids.convertido_id
    when 'NÃO INAUGUROU' then ids.perdido_id
    when 'SEM PEDIDO MÍNIMO' then ids.perdido_id
    when 'SEM INTERESSE' then ids.perdido_id
    when 'NÃO ATENDEMOS A REGIÃO' then ids.perdido_id
    when 'NÃO TEMOS O PÃO' then ids.perdido_id
    when 'NÃO RESPONDE' then ids.perdido_id
    else o.stage_id
  end,
  lost_reason = case upper(trim(ps.name))
    when 'NÃO INAUGUROU' then coalesce(nullif(trim(o.lost_reason), ''), 'Não inaugurou')
    when 'SEM PEDIDO MÍNIMO' then coalesce(nullif(trim(o.lost_reason), ''), 'Sem pedido mínimo')
    when 'SEM INTERESSE' then coalesce(nullif(trim(o.lost_reason), ''), 'Sem interesse')
    when 'NÃO ATENDEMOS A REGIÃO' then coalesce(nullif(trim(o.lost_reason), ''), 'Não atendemos a região')
    when 'NÃO TEMOS O PÃO' then coalesce(nullif(trim(o.lost_reason), ''), 'Não temos o pão')
    when 'NÃO RESPONDE' then coalesce(nullif(trim(o.lost_reason), ''), 'Não responde')
    when 'JÁ É CLIENTE' then null
    when 'CLIENTE' then null
    else o.lost_reason
  end,
  updated_at = now()
from crm.pipeline_stages ps, ids
where o.stage_id = ps.id
  and upper(trim(ps.name)) in (
    'CHATBOT',
    'ENTRADA',
    'SEM RETORNO',
    'AMOSTRA',
    'ENCAMINHADO PARA DISTRIBUIDOR',
    'JÁ É CLIENTE',
    'CLIENTE',
    'NÃO INAUGUROU',
    'SEM PEDIDO MÍNIMO',
    'SEM INTERESSE',
    'NÃO ATENDEMOS A REGIÃO',
    'NÃO TEMOS O PÃO',
    'NÃO RESPONDE'
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
  target_lost_reason text;
begin
  if tg_table_name = 'conversations' then
    target_lead_id := new.lead_id;
    target_stage_name := case upper(trim(coalesce(new.classification, '')))
      when 'CHATBOT' then 'LEADS'
      when 'AMOSTRA' then 'NEGOCIAÇÃO'
      when 'NEGOCIAÇÃO' then 'NEGOCIAÇÃO'
      when 'SEM INTERESSE' then 'PERDIDO'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'NEGOCIAÇÃO'
      when 'NÃO ATENDEMOS A REGIÃO' then 'PERDIDO'
      when 'NÃO TEMOS O PÃO' then 'PERDIDO'
      when 'NÃO RESPONDE' then 'PERDIDO'
      when 'SEM RETORNO' then 'QUALIFICAÇÃO'
      when 'JÁ É CLIENTE' then 'CONVERTIDO'
      when 'NÃO INAUGUROU' then 'PERDIDO'
      when 'SEM PEDIDO MÍNIMO' then 'PERDIDO'
      when 'CLIENTE' then 'CONVERTIDO'
      else null
    end;
    target_lost_reason := case upper(trim(coalesce(new.classification, '')))
      when 'SEM INTERESSE' then 'Sem interesse'
      when 'NÃO ATENDEMOS A REGIÃO' then 'Não atendemos a região'
      when 'NÃO TEMOS O PÃO' then 'Não temos o pão'
      when 'NÃO RESPONDE' then 'Não responde'
      when 'NÃO INAUGUROU' then 'Não inaugurou'
      when 'SEM PEDIDO MÍNIMO' then 'Sem pedido mínimo'
      else null
    end;
  elsif tg_table_name = 'leads' then
    if lower(trim(coalesce(new.status, ''))) <> 'em negociação' then
      return new;
    end if;
    target_lead_id := new.id;
    target_stage_name := 'NEGOCIAÇÃO';
    target_lost_reason := null;
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
    set
      stage_id = target_stage_id,
      lost_reason = case
        when target_stage_name = 'PERDIDO' then coalesce(target_lost_reason, lost_reason)
        else null
      end,
      updated_at = now()
    where lead_id = target_lead_id;
  end if;

  return new;
end;
$$;

create or replace function crm.canonicalize_opportunity_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  source_name text;
  target_name text;
  target_id uuid;
  inferred_lost_reason text;
begin
  select upper(trim(name)) into source_name
  from crm.pipeline_stages
  where id = new.stage_id;

  target_name := case source_name
    when 'CHATBOT' then 'LEADS'
    when 'ENTRADA' then 'LEADS'
    when 'SEM RETORNO' then 'QUALIFICAÇÃO'
    when 'AMOSTRA' then 'NEGOCIAÇÃO'
    when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'NEGOCIAÇÃO'
    when 'JÁ É CLIENTE' then 'CONVERTIDO'
    when 'CLIENTE' then 'CONVERTIDO'
    when 'NÃO INAUGUROU' then 'PERDIDO'
    when 'SEM PEDIDO MÍNIMO' then 'PERDIDO'
    when 'SEM INTERESSE' then 'PERDIDO'
    when 'NÃO ATENDEMOS A REGIÃO' then 'PERDIDO'
    when 'NÃO TEMOS O PÃO' then 'PERDIDO'
    when 'NÃO RESPONDE' then 'PERDIDO'
    else source_name
  end;

  if target_name is null or target_name = source_name then
    return new;
  end if;

  select id into target_id
  from crm.pipeline_stages
  where upper(trim(name)) = target_name
  order by sort_order
  limit 1;

  if target_id is null then
    return new;
  end if;

  inferred_lost_reason := case source_name
    when 'NÃO INAUGUROU' then 'Não inaugurou'
    when 'SEM PEDIDO MÍNIMO' then 'Sem pedido mínimo'
    when 'SEM INTERESSE' then 'Sem interesse'
    when 'NÃO ATENDEMOS A REGIÃO' then 'Não atendemos a região'
    when 'NÃO TEMOS O PÃO' then 'Não temos o pão'
    when 'NÃO RESPONDE' then 'Não responde'
    else null
  end;

  new.stage_id := target_id;
  if target_name = 'PERDIDO' then
    new.lost_reason := coalesce(nullif(trim(new.lost_reason), ''), inferred_lost_reason);
  elsif target_name = 'CONVERTIDO' then
    new.lost_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_canonicalize_opportunity_pipeline_stage on crm.opportunities;
create trigger trg_canonicalize_opportunity_pipeline_stage
before insert or update of stage_id on crm.opportunities
for each row execute function crm.canonicalize_opportunity_pipeline_stage();

commit;
