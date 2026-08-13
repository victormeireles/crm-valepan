-- Mantém a etapa do funil sincronizada no próprio banco, independentemente
-- da tela usada para classificar o contato.

begin;

create or replace function crm.sync_negotiation_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  target_lead_id uuid;
  negotiation_stage_id uuid;
begin
  if tg_table_name = 'conversations' then
    if upper(trim(coalesce(new.classification, ''))) <> 'NEGOCIAÇÃO' then
      return new;
    end if;
    target_lead_id := new.lead_id;
  elsif tg_table_name = 'leads' then
    if lower(trim(coalesce(new.status, ''))) <> 'em negociação' then
      return new;
    end if;
    target_lead_id := new.id;
  end if;

  if target_lead_id is null then
    return new;
  end if;

  select id into negotiation_stage_id
  from crm.pipeline_stages
  where upper(trim(name)) = 'NEGOCIAÇÃO'
  order by sort_order
  limit 1;

  if negotiation_stage_id is not null then
    update crm.opportunities
    set stage_id = negotiation_stage_id, updated_at = now()
    where lead_id = target_lead_id
      and stage_id <> negotiation_stage_id;
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
