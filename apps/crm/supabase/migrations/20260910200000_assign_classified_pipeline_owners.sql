-- Um lead sem responsavel deixa de ser visivel para o comercial assim que sai
-- da etapa de entrada. Garante que a classificacao feita por um usuario tambem
-- reivindique o lead e repara classificacoes historicas rastreaveis.

begin;

create or replace function crm.claim_pipeline_owner_when_leaving_entry()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  actor_id uuid := auth.uid();
  target_is_classified boolean := false;
begin
  if new.lead_id is null or new.stage_id is null then
    return new;
  end if;

  select upper(trim(stage.name)) not in ('LEADS', 'ENTRADA')
  into target_is_classified
  from crm.pipeline_stages stage
  where stage.id = new.stage_id;

  if not coalesce(target_is_classified, false)
    or actor_id is null
    or not exists (select 1 from crm.profiles profile where profile.id = actor_id)
  then
    return new;
  end if;

  if new.owner_id is null then
    new.owner_id := actor_id;
  end if;

  update crm.leads lead
  set owner_id = actor_id, updated_at = now()
  where lead.id = new.lead_id
    and lead.owner_id is null;

  return new;
end;
$$;

drop trigger if exists opportunities_claim_owner_when_classified on crm.opportunities;
create trigger opportunities_claim_owner_when_classified
before insert or update of lead_id, stage_id on crm.opportunities
for each row execute function crm.claim_pipeline_owner_when_leaving_entry();

comment on function crm.claim_pipeline_owner_when_leaving_entry() is
  'Ao mover uma oportunidade para fora da entrada, atribui registros sem responsavel ao usuario autenticado para preservar a visibilidade da carteira.';

revoke all on function crm.claim_pipeline_owner_when_leaving_entry() from public;

-- Prioriza um responsavel ja existente. Para cards inteiramente sem dono, usa
-- o autor da movimentacao explicita mais recente registrada no historico.
with classified_candidates as (
  select
    opportunity.lead_id,
    coalesce(
      lead.owner_id,
      opportunity.owner_id,
      (
        select activity.actor_id
        from crm.activity_logs activity
        inner join crm.profiles actor on actor.id = activity.actor_id
        where activity.entity_type = 'opportunity'
          and activity.entity_id = opportunity.id
          and activity.action = 'stage_changed'
        order by activity.created_at desc
        limit 1
      )
    ) as owner_id,
    opportunity.updated_at
  from crm.opportunities opportunity
  inner join crm.leads lead on lead.id = opportunity.lead_id
  inner join crm.pipeline_stages stage on stage.id = opportunity.stage_id
  where upper(trim(stage.name)) not in ('LEADS', 'ENTRADA')
), lead_candidates as (
  select distinct on (candidate.lead_id)
    candidate.lead_id,
    candidate.owner_id
  from classified_candidates candidate
  where candidate.owner_id is not null
  order by candidate.lead_id, candidate.updated_at desc
)
update crm.leads lead
set owner_id = candidate.owner_id
from lead_candidates candidate
where lead.id = candidate.lead_id
  and lead.owner_id is null;

update crm.opportunities opportunity
set owner_id = lead.owner_id
from crm.leads lead, crm.pipeline_stages stage
where lead.id = opportunity.lead_id
  and stage.id = opportunity.stage_id
  and upper(trim(stage.name)) not in ('LEADS', 'ENTRADA')
  and opportunity.owner_id is null
  and lead.owner_id is not null;

commit;
