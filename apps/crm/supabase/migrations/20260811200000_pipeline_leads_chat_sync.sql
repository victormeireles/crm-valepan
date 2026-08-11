-- LEADS e a caixa unica de entrada dos contatos ainda nao qualificados.
-- A migration e conservadora: nao move nem reclassifica oportunidades existentes.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'LEADS', 1, false
where not exists (
  select 1
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
);

update crm.pipeline_stages
set sort_order = 1, is_final = false
where upper(trim(name)) = 'LEADS';

-- Garante que as demais etapas continuem depois da entrada, sem trocar
-- a classificacao de qualquer oportunidade que ja exista.
update crm.pipeline_stages
set sort_order = 2
where upper(trim(name)) = 'CHATBOT'
  and sort_order <= 1;

-- Inclui somente leads individuais do chat que nunca tiveram oportunidade.
with inserted as (
  insert into crm.opportunities (lead_id, company_id, owner_id, stage_id, title)
  select
    l.id,
    l.company_id,
    l.owner_id,
    ps.id,
    'WhatsApp ' || l.phone_e164
  from crm.leads l
  cross join lateral (
    select id
    from crm.pipeline_stages
    where upper(trim(name)) = 'LEADS'
    limit 1
  ) ps
  where l.excluded_from_pipeline_at is null
    and exists (
      select 1
      from crm.conversations c
      where c.lead_id = l.id
        and c.conversation_kind = 'lead'
    )
    and not exists (
      select 1
      from crm.opportunities o
      where o.lead_id = l.id
    )
  returning id, lead_id, stage_id
)
insert into crm.activity_logs (entity_type, entity_id, action, payload)
select
  'opportunity',
  i.id,
  'created_from_chat_backfill',
  jsonb_build_object('lead_id', i.lead_id, 'stage_id', i.stage_id)
from inserted i;

create or replace function public.crm_first_pipeline_stage_id()
returns uuid
language sql
stable
security definer
set search_path = crm, public
as $$
  select id
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
  order by sort_order asc
  limit 1;
$$;

revoke all on function public.crm_first_pipeline_stage_id() from public;
grant execute on function public.crm_first_pipeline_stage_id() to service_role;
grant execute on function public.crm_first_pipeline_stage_id() to authenticated;

commit;
