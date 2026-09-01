-- LEADS e ENTRADA foram usados historicamente para a mesma fila.
-- Consolida todas as oportunidades em uma única etapa LEADS, sempre a primeira.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'LEADS', 1, false
where not exists (
  select 1
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
);

with canonical as (
  select id
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
  order by created_at, id
  limit 1
)
update crm.opportunities o
set
  stage_id = canonical.id,
  updated_at = now()
from canonical
where o.stage_id in (
  select id
  from crm.pipeline_stages
  where upper(trim(name)) in ('LEADS', 'ENTRADA')
)
and o.stage_id <> canonical.id;

-- Remove etapas duplicadas somente depois de transferir suas oportunidades.
-- Modelos de tarefas dessas etapas são removidos pelo vínculo on delete cascade.
with canonical as (
  select id
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
  order by created_at, id
  limit 1
)
delete from crm.pipeline_stages ps
using canonical
where upper(trim(ps.name)) in ('LEADS', 'ENTRADA')
  and ps.id <> canonical.id;

update crm.pipeline_stages
set name = 'LEADS', sort_order = 1, is_final = false
where upper(trim(name)) = 'LEADS';

-- Uma migração histórica tratou todas as oportunidades que estavam em
-- QUALIFICAÇÃO como backlog e as devolveu para a etapa inicial. Isso também
-- atingiu oportunidades que já tinham sido classificadas manualmente.
--
-- O activity_log é a fonte rastreável da última mudança explícita feita no
-- funil. Restaura somente oportunidades que continuam na entrada e cujo último
-- stage_changed aponta para uma etapa não inicial. Assim, novos leads legítimos
-- permanecem em LEADS e classificações posteriores não são sobrescritas.
with latest_explicit_stage as (
  select distinct on (al.entity_id)
    al.entity_id as opportunity_id,
    al.payload ->> 'stage_id' as stage_id
  from crm.activity_logs al
  where al.entity_type = 'opportunity'
    and al.action = 'stage_changed'
    and nullif(al.payload ->> 'stage_id', '') is not null
  order by al.entity_id, al.created_at desc
), restorable as (
  select
    les.opportunity_id,
    ps.id as stage_id
  from latest_explicit_stage les
  join crm.pipeline_stages ps
    on ps.id = les.stage_id::uuid
  where upper(trim(ps.name)) not in ('LEADS', 'ENTRADA')
)
update crm.opportunities o
set
  stage_id = restorable.stage_id,
  updated_at = now()
from restorable
where o.id = restorable.opportunity_id
  and o.stage_id in (
    select id
    from crm.pipeline_stages
    where upper(trim(name)) = 'LEADS'
  );

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
  order by sort_order, created_at
  limit 1;
$$;

revoke all on function public.crm_first_pipeline_stage_id() from public;
grant execute on function public.crm_first_pipeline_stage_id() to service_role;
grant execute on function public.crm_first_pipeline_stage_id() to authenticated;

commit;
