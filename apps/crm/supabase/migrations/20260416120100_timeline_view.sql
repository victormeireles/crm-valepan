-- Visão agregada para timeline (leitura no app)
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
union all
select
  'task'::text,
  t.id,
  t.created_at,
  t.lead_id,
  t.opportunity_id,
  jsonb_build_object('title', t.title, 'due_at', t.due_at, 'done', t.done)
from crm.tasks t
union all
select
  'activity'::text,
  a.id,
  a.created_at,
  null::uuid,
  null::uuid,
  jsonb_build_object('action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'payload', a.payload)
from crm.activity_logs a;

grant select on crm.timeline_events to authenticated;
