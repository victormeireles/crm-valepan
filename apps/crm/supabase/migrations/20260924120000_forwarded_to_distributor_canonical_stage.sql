-- Promove "Encaminhado para distribuidor" de status de Negociação para
-- uma etapa canônica própria, preservando histórico e automações existentes.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'ENCAMINHADO PARA DISTRIBUIDOR', 40, false
where not exists (
  select 1
  from crm.pipeline_stages
  where upper(trim(name)) = 'ENCAMINHADO PARA DISTRIBUIDOR'
);

update crm.pipeline_stages
set
  sort_order = case upper(trim(name))
    when 'LEADS' then 10
    when 'QUALIFICAÇÃO' then 20
    when 'NEGOCIAÇÃO' then 30
    when 'ENCAMINHADO PARA DISTRIBUIDOR' then 40
    when 'CONVERTIDO' then 50
    when 'PERDIDO' then 60
    else sort_order
  end,
  is_final = upper(trim(name)) in ('CONVERTIDO', 'PERDIDO')
where upper(trim(name)) in (
  'LEADS',
  'QUALIFICAÇÃO',
  'NEGOCIAÇÃO',
  'ENCAMINHADO PARA DISTRIBUIDOR',
  'CONVERTIDO',
  'PERDIDO'
);

alter table crm.lost_reasons
  drop constraint if exists lost_reasons_stage_key_check;

update crm.lost_reasons
set
  stage_key = 'ENCAMINHADO PARA DISTRIBUIDOR',
  sort_order = 10,
  updated_at = now()
where lower(trim(name)) = 'encaminhado para o distribuidor';

alter table crm.lost_reasons
  add constraint lost_reasons_stage_key_check
  check (stage_key in (
    'LEADS',
    'QUALIFICAÇÃO',
    'NEGOCIAÇÃO',
    'ENCAMINHADO PARA DISTRIBUIDOR',
    'CONVERTIDO',
    'PERDIDO'
  ));

comment on column crm.lost_reasons.stage_key is
  'Etapa canônica (LEADS, QUALIFICAÇÃO, NEGOCIAÇÃO, ENCAMINHADO PARA DISTRIBUIDOR, CONVERTIDO, PERDIDO) à qual o status se aplica.';

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
    when 'SOLUÇÃO COMERCIAL' then 'ENCAMINHADO PARA DISTRIBUIDOR'
    when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
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

with target as (
  select id
  from crm.pipeline_stages
  where upper(trim(name)) = 'ENCAMINHADO PARA DISTRIBUIDOR'
  order by sort_order
  limit 1
)
update crm.opportunities opportunity
set
  stage_id = target.id,
  lost_reason = 'Encaminhado para o distribuidor',
  updated_at = now()
from crm.pipeline_stages current_stage, target
where current_stage.id = opportunity.stage_id
  and (
    upper(trim(current_stage.name)) in (
      'SOLUÇÃO COMERCIAL',
      'ENCAMINHADO PARA DISTRIBUIDOR',
      'ENCAMINHADO PARA O DISTRIBUIDOR'
    )
    or lower(trim(coalesce(opportunity.lost_reason, ''))) = 'encaminhado para o distribuidor'
    or exists (
      select 1
      from crm.conversations conversation
      where conversation.lead_id = opportunity.lead_id
        and upper(trim(coalesce(conversation.classification, ''))) in (
          'ENCAMINHADO PARA DISTRIBUIDOR',
          'ENCAMINHADO PARA O DISTRIBUIDOR'
        )
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
  target_lost_reason text;
begin
  if tg_table_name = 'conversations' then
    target_lead_id := new.lead_id;
    target_stage_name := case upper(trim(coalesce(new.classification, '')))
      when 'CHATBOT' then 'LEADS'
      when 'AMOSTRA' then 'NEGOCIAÇÃO'
      when 'NEGOCIAÇÃO' then 'NEGOCIAÇÃO'
      when 'SEM INTERESSE' then 'PERDIDO'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
      when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'ENCAMINHADO PARA DISTRIBUIDOR'
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
      when 'CHATBOT' then 'Chatbot'
      when 'SEM RETORNO' then 'Sem retorno'
      when 'AMOSTRA' then 'Pediu amostra'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
      when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
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
        when target_lost_reason is not null then target_lost_reason
        else lost_reason
      end,
      updated_at = now()
    where lead_id = target_lead_id;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_sync_negotiation_pipeline on crm.conversations;
create trigger conversations_sync_negotiation_pipeline
after insert or update of classification, lead_id on crm.conversations
for each row execute function crm.sync_negotiation_pipeline_stage();

drop trigger if exists leads_sync_negotiation_pipeline on crm.leads;
create trigger leads_sync_negotiation_pipeline
after insert or update of status on crm.leads
for each row execute function crm.sync_negotiation_pipeline_stage();

commit;
