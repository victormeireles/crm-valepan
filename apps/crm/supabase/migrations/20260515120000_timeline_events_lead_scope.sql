-- Timeline: associar activity_logs ao lead (e oportunidade) + enriquecer dados para a UI.
-- Remove duplicatas já cobertas por notas/mensagens na mesma vista.

create or replace view crm.timeline_events as
select
  'message'::text as kind,
  m.id as event_id,
  m.sent_at as at,
  l.id as lead_id,
  (
    select o.id from crm.opportunities o
    where o.lead_id = l.id
    order by o.created_at desc
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
    'assignee_id', t.assignee_id,
    'assignee_name', tp.full_name
  )
from crm.tasks t
left join crm.profiles tp on tp.id = t.assignee_id
where t.lead_id is not null
union all
select
  'activity'::text,
  a.id,
  a.created_at,
  case
    when a.entity_type = 'lead' then a.entity_id
    when a.entity_type = 'opportunity' then o.lead_id
    else null::uuid
  end as lead_id,
  case
    when a.entity_type = 'opportunity' then a.entity_id
    when a.entity_type = 'lead' then (
      select o2.id from crm.opportunities o2
      where o2.lead_id = a.entity_id
      order by o2.created_at desc
      limit 1
    )
    else null::uuid
  end as opportunity_id,
  jsonb_build_object(
    'action', a.action,
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'payload', coalesce(a.payload, '{}'::jsonb),
    'actor_id', a.actor_id,
    'actor_name', ap.full_name,
    'stage_name', ps.name,
    'owner_name', owner_profile.full_name
  )
from crm.activity_logs a
left join crm.opportunities o
  on a.entity_type = 'opportunity' and o.id = a.entity_id
left join crm.profiles ap on ap.id = a.actor_id
left join crm.pipeline_stages ps
  on a.action = 'stage_changed'
  and length(coalesce(a.payload->>'stage_id', '')) = 36
  and ps.id = (a.payload->>'stage_id')::uuid
left join crm.profiles owner_profile
  on a.action = 'owner_changed'
  and length(coalesce(a.payload->>'owner_id', '')) = 36
  and owner_profile.id = (a.payload->>'owner_id')::uuid
where
  not (a.action = 'note_added' and a.entity_type = 'lead')
  and not (a.action = 'outbound_whatsapp' and a.entity_type = 'lead');

grant select on crm.timeline_events to authenticated;
