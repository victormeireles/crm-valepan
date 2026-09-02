-- Cada lead deve ocupar exatamente uma etapa do funil.
-- Consolida duplicidades historicas, preserva a ultima movimentacao explicita
-- e impede que webhooks concorrentes criem um segundo card para o mesmo lead.

begin;

create temporary table pipeline_opportunity_resolution on commit drop as
with latest_explicit_stage as (
  select distinct on (o.lead_id)
    o.lead_id,
    o.id as opportunity_id,
    ps.id as stage_id
  from crm.opportunities o
  join crm.activity_logs al
    on al.entity_type = 'opportunity'
   and al.entity_id = o.id
   and al.action = 'stage_changed'
  join crm.pipeline_stages ps
    on ps.id::text = al.payload ->> 'stage_id'
  where o.lead_id is not null
  order by o.lead_id, al.created_at desc, al.id desc
), ranked as (
  select
    o.lead_id,
    o.id,
    o.stage_id,
    les.stage_id as explicit_stage_id,
    row_number() over (
      partition by o.lead_id
      order by
        (o.id = les.opportunity_id) desc,
        (upper(trim(ps.name)) not in ('LEADS', 'ENTRADA')) desc,
        o.updated_at desc,
        o.created_at desc,
        o.id
    ) as position
  from crm.opportunities o
  join crm.pipeline_stages ps on ps.id = o.stage_id
  left join latest_explicit_stage les on les.lead_id = o.lead_id
  where o.lead_id is not null
    and exists (
      select 1
      from crm.opportunities duplicate
      where duplicate.lead_id = o.lead_id
        and duplicate.id <> o.id
    )
)
select
  lead_id,
  id as keeper_id,
  coalesce(explicit_stage_id, stage_id) as desired_stage_id
from ranked
where position = 1;

-- A etapa rastreada mais recentemente vence. Na ausencia de historico,
-- preservamos uma etapa classificada em vez da entrada LEADS.
update crm.opportunities keeper
set
  stage_id = resolution.desired_stage_id,
  updated_at = greatest(keeper.updated_at, now())
from pipeline_opportunity_resolution resolution
where keeper.id = resolution.keeper_id
  and keeper.stage_id <> resolution.desired_stage_id;

-- Preserva os relacionamentos antes de remover os cards redundantes.
update crm.tasks task
set opportunity_id = resolution.keeper_id
from crm.opportunities duplicate
join pipeline_opportunity_resolution resolution
  on resolution.lead_id = duplicate.lead_id
where task.opportunity_id = duplicate.id
  and duplicate.id <> resolution.keeper_id;

update crm.notes note
set opportunity_id = resolution.keeper_id
from crm.opportunities duplicate
join pipeline_opportunity_resolution resolution
  on resolution.lead_id = duplicate.lead_id
where note.opportunity_id = duplicate.id
  and duplicate.id <> resolution.keeper_id;

-- O log de automacao tem unicidade por oportunidade/modelo. Descarta somente
-- a copia redundante quando o mesmo modelo ja esta registrado no card mantido.
delete from crm.pipeline_stage_automation_log duplicate_log
using crm.opportunities duplicate, pipeline_opportunity_resolution resolution
where duplicate_log.opportunity_id = duplicate.id
  and duplicate.lead_id = resolution.lead_id
  and duplicate.id <> resolution.keeper_id
  and exists (
    select 1
    from crm.pipeline_stage_automation_log keeper_log
    where keeper_log.opportunity_id = resolution.keeper_id
      and keeper_log.template_id = duplicate_log.template_id
  );

update crm.pipeline_stage_automation_log automation_log
set opportunity_id = resolution.keeper_id
from crm.opportunities duplicate
join pipeline_opportunity_resolution resolution
  on resolution.lead_id = duplicate.lead_id
where automation_log.opportunity_id = duplicate.id
  and duplicate.id <> resolution.keeper_id;

update crm.activity_logs activity
set entity_id = resolution.keeper_id
from crm.opportunities duplicate
join pipeline_opportunity_resolution resolution
  on resolution.lead_id = duplicate.lead_id
where activity.entity_type = 'opportunity'
  and activity.entity_id = duplicate.id
  and duplicate.id <> resolution.keeper_id;

delete from crm.opportunities duplicate
using pipeline_opportunity_resolution resolution
where duplicate.lead_id = resolution.lead_id
  and duplicate.id <> resolution.keeper_id;

create unique index if not exists opportunities_one_per_lead
  on crm.opportunities (lead_id)
  where lead_id is not null;

commit;
