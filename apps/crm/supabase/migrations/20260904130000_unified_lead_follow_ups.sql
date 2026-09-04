-- Follow-up passa a ser uma tarefa operacional especial ligada ao lead.
-- `opportunities.next_action_at` continua como projeção para o funil, mas
-- deixa de ser uma segunda fonte editável da mesma informação.

begin;

alter table crm.tasks
  add column if not exists task_kind text not null default 'task',
  add column if not exists completed_at timestamptz;

alter table crm.tasks
  drop constraint if exists tasks_task_kind_check;

alter table crm.tasks
  add constraint tasks_task_kind_check
  check (task_kind in ('task', 'follow_up'));

-- Quando a data antiga veio de uma tarefa, preserva o texto e transforma a
-- tarefa correspondente no follow-up atual.
with matching_task as (
  select distinct on (t.lead_id)
    t.id
  from crm.tasks t
  join crm.opportunities o
    on o.id = t.opportunity_id
   and o.lead_id = t.lead_id
  where t.lead_id is not null
    and t.done = false
    and t.due_at is not null
    and o.next_action_at = t.due_at
  order by t.lead_id, t.updated_at desc, t.created_at desc, t.id
)
update crm.tasks t
set task_kind = 'follow_up'
from matching_task m
where t.id = m.id;

-- Datas cadastradas diretamente no antigo campo "Próxima ação" também são
-- preservadas, agora como um registro que pode ser concluído e auditado.
insert into crm.tasks (
  lead_id,
  opportunity_id,
  title,
  due_at,
  assignee_id,
  task_kind,
  done
)
select
  o.lead_id,
  o.id,
  'Retomar contato',
  o.next_action_at,
  coalesce(l.owner_id, o.owner_id),
  'follow_up',
  false
from crm.opportunities o
join crm.leads l on l.id = o.lead_id
where o.lead_id is not null
  and o.next_action_at is not null
  and not exists (
    select 1
    from crm.tasks t
    where t.lead_id = o.lead_id
      and t.task_kind = 'follow_up'
      and t.done = false
  );

alter table crm.tasks
  drop constraint if exists tasks_follow_up_due_at_check;

alter table crm.tasks
  add constraint tasks_follow_up_due_at_check
  check (task_kind <> 'follow_up' or due_at is not null);

create unique index if not exists idx_tasks_one_open_follow_up_per_lead
  on crm.tasks (lead_id)
  where task_kind = 'follow_up' and done = false and lead_id is not null;

create index if not exists idx_tasks_open_follow_up_due_at
  on crm.tasks (due_at, lead_id)
  where task_kind = 'follow_up' and done = false;

comment on column crm.tasks.task_kind is
  'Distingue tarefas comuns do único follow-up operacional em aberto de cada lead.';

comment on column crm.tasks.completed_at is
  'Momento em que a tarefa ou follow-up foi concluído; nulo enquanto estiver em aberto.';

create or replace function crm.sync_lead_follow_up_next_action()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  affected_lead_id uuid;
  previous_lead_id uuid;
begin
  if tg_op = 'DELETE' and old.task_kind <> 'follow_up' then
    return old;
  end if;
  if tg_op = 'INSERT' and new.task_kind <> 'follow_up' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.task_kind <> 'follow_up' and new.task_kind <> 'follow_up' then
    return new;
  end if;

  affected_lead_id := case when tg_op = 'DELETE' then old.lead_id else new.lead_id end;
  previous_lead_id := case when tg_op = 'UPDATE' then old.lead_id else null end;

  if affected_lead_id is not null then
    update crm.opportunities o
    set
      next_action_at = (
        select min(t.due_at)
        from crm.tasks t
        where t.lead_id = affected_lead_id
          and t.task_kind = 'follow_up'
          and t.done = false
      ),
      updated_at = now()
    where o.lead_id = affected_lead_id;
  end if;

  if previous_lead_id is not null and previous_lead_id is distinct from affected_lead_id then
    update crm.opportunities o
    set
      next_action_at = (
        select min(t.due_at)
        from crm.tasks t
        where t.lead_id = previous_lead_id
          and t.task_kind = 'follow_up'
          and t.done = false
      ),
      updated_at = now()
    where o.lead_id = previous_lead_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_lead_follow_up_next_action on crm.tasks;
create trigger sync_lead_follow_up_next_action
  after insert or update or delete on crm.tasks
  for each row execute function crm.sync_lead_follow_up_next_action();

-- Um lead pode receber follow-up antes de entrar no funil. Ao criar sua
-- oportunidade, projeta a data existente automaticamente.
create or replace function crm.project_follow_up_on_new_opportunity()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if new.lead_id is not null and new.next_action_at is null then
    select min(t.due_at)
    into new.next_action_at
    from crm.tasks t
    where t.lead_id = new.lead_id
      and t.task_kind = 'follow_up'
      and t.done = false;
  end if;
  return new;
end;
$$;

drop trigger if exists project_follow_up_on_new_opportunity on crm.opportunities;
create trigger project_follow_up_on_new_opportunity
  before insert on crm.opportunities
  for each row execute function crm.project_follow_up_on_new_opportunity();

-- Inclui o tipo na timeline para a interface usar o mesmo nome em todo lugar.
create or replace view crm.timeline_events as
select
  'message'::text as kind,
  m.id as event_id,
  m.sent_at as at,
  l.id as lead_id,
  (
    select o.id
    from crm.opportunities o
    where o.lead_id = l.id
    order by o.updated_at desc
    limit 1
  ) as opportunity_id,
  jsonb_build_object(
    'direction', m.direction,
    'body', m.body,
    'conversation_id', m.conversation_id
  ) as data
from crm.messages m
join crm.conversations c on c.id = m.conversation_id
join crm.leads l on l.id = c.lead_id
union all
select
  'note'::text,
  n.id,
  n.created_at,
  n.lead_id,
  n.opportunity_id,
  jsonb_build_object('body', n.body, 'author_id', n.author_id)
from crm.notes n
where n.lead_id is not null
union all
select
  'task'::text,
  t.id,
  t.created_at,
  t.lead_id,
  t.opportunity_id,
  jsonb_build_object(
    'title', t.title,
    'due_at', t.due_at,
    'done', t.done,
    'task_kind', t.task_kind,
    'completed_at', t.completed_at
  )
from crm.tasks t
where t.lead_id is not null
union all
select
  'sample'::text,
  s.id,
  s.created_at,
  s.lead_id,
  (
    select o.id
    from crm.opportunities o
    where o.lead_id = s.lead_id
    order by o.updated_at desc
    limit 1
  ) as opportunity_id,
  jsonb_build_object(
    'status', s.status,
    'contact_name', s.contact_name,
    'bread_type', s.bread_type
  ) as data
from crm.sample_shipments s
where s.lead_id is not null
union all
select
  'activity'::text,
  a.id,
  a.created_at,
  coalesce(
    case when a.entity_type = 'lead' then a.entity_id end,
    opp_entity.lead_id
  ) as lead_id,
  case
    when a.entity_type = 'opportunity' then a.entity_id
    when a.entity_type = 'lead' then opp_lead.id
    else null
  end as opportunity_id,
  jsonb_build_object(
    'action', a.action,
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'payload', a.payload,
    'actor_id', a.actor_id,
    'actor_name', prof.full_name
  ) as data
from crm.activity_logs a
left join crm.opportunities opp_entity
  on a.entity_type = 'opportunity' and opp_entity.id = a.entity_id
left join lateral (
  select o.id
  from crm.opportunities o
  where o.lead_id = a.entity_id
  order by o.updated_at desc
  limit 1
) opp_lead on a.entity_type = 'lead'
left join crm.profiles prof on prof.id = a.actor_id
where a.action not in (
  'note_added',
  'follow_up_scheduled',
  'outbound_whatsapp',
  'outbound_whatsapp_contact',
  'outbound_whatsapp_attachment'
)
and coalesce(
  case when a.entity_type = 'lead' then a.entity_id end,
  opp_entity.lead_id
) is not null;

grant select on crm.timeline_events to authenticated;

commit;
