-- Subetapas (status) por etapa canônica do funil.
-- Reusa crm.lost_reasons: o que era só motivo de perda passa a ser o catálogo
-- de status de cada etapa (Novo, Qualificação, Negociação, Cliente, Perdido).

begin;

alter table crm.lost_reasons
  add column if not exists stage_key text;

update crm.lost_reasons
set stage_key = 'PERDIDO'
where stage_key is null or btrim(stage_key) = '';

alter table crm.lost_reasons
  alter column stage_key set default 'PERDIDO';

alter table crm.lost_reasons
  alter column stage_key set not null;

alter table crm.lost_reasons
  drop constraint if exists lost_reasons_stage_key_check;

alter table crm.lost_reasons
  add constraint lost_reasons_stage_key_check
  check (stage_key in ('LEADS', 'QUALIFICAÇÃO', 'NEGOCIAÇÃO', 'CONVERTIDO', 'PERDIDO'));

drop index if exists crm.lost_reasons_name_unique;

create unique index if not exists lost_reasons_stage_name_unique
  on crm.lost_reasons (stage_key, lower(trim(name)));

drop index if exists crm.idx_lost_reasons_active_sort;

create index if not exists idx_lost_reasons_stage_active_sort
  on crm.lost_reasons (stage_key, active, sort_order, name);

comment on table crm.lost_reasons is
  'Subetapas/status do funil, gerenciados em Configurações → Subetapas. stage_key é a etapa canônica.';

comment on column crm.lost_reasons.stage_key is
  'Etapa canônica (LEADS, QUALIFICAÇÃO, NEGOCIAÇÃO, CONVERTIDO, PERDIDO) à qual o status se aplica.';

insert into crm.lost_reasons (name, sort_order, stage_key)
select v.name, v.sort_order, v.stage_key
from (
  values
    ('Chatbot', 10, 'LEADS'),
    ('Sem retorno', 10, 'QUALIFICAÇÃO'),
    ('Pediu amostra', 10, 'NEGOCIAÇÃO'),
    ('Recebeu amostra', 20, 'NEGOCIAÇÃO'),
    ('Encaminhado para o distribuidor', 30, 'NEGOCIAÇÃO')
) as v(name, sort_order, stage_key)
where not exists (
  select 1
  from crm.lost_reasons existing
  where existing.stage_key = v.stage_key
    and lower(trim(existing.name)) = lower(trim(v.name))
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
      when 'CHATBOT' then 'Chatbot'
      when 'SEM RETORNO' then 'Sem retorno'
      when 'AMOSTRA' then 'Pediu amostra'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
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

commit;
