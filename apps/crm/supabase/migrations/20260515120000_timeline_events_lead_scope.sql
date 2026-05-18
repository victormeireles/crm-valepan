-- Timeline: activity_logs com lead_id/opportunity_id; amostras; sem duplicar notas/mensagens.

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
  jsonb_build_object('title', t.title, 'due_at', t.due_at, 'done', t.done)
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
  'outbound_whatsapp',
  'outbound_whatsapp_contact',
  'outbound_whatsapp_attachment'
)
and coalesce(
  case when a.entity_type = 'lead' then a.entity_id end,
  opp_entity.lead_id
) is not null;

grant select on crm.timeline_events to authenticated;
