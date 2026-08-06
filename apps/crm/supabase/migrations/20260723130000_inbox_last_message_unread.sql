-- A Inbox passa a receber a última mensagem e a última entrada do cliente
-- diretamente do banco, sem baixar o histórico para calcular "não lidas".
create index if not exists idx_messages_conversation_latest
  on crm.messages (conversation_id, sent_at desc, id desc);

create index if not exists idx_messages_conversation_latest_inbound
  on crm.messages (conversation_id, sent_at desc, id desc)
  where direction = 'in';

create or replace view crm.v_conversation_last_message as
select
  c.id as conversation_id,
  c.lead_id,
  latest.direction::text as last_direction,
  latest.sent_at as last_sent_at,
  left(coalesce(latest.body, ''), 500) as last_body_preview,
  inbound.sent_at as last_inbound_sent_at
from crm.conversations c
inner join lateral (
  select m.direction, m.sent_at, m.body
  from crm.messages m
  where m.conversation_id = c.id
  order by m.sent_at desc, m.id desc
  limit 1
) latest on true
left join lateral (
  select m.sent_at
  from crm.messages m
  where m.conversation_id = c.id
    and m.direction = 'in'
  order by m.sent_at desc, m.id desc
  limit 1
) inbound on true;

comment on view crm.v_conversation_last_message is
  'Última mensagem e última entrada por conversa; usada na Inbox sem carregar o histórico.';

grant select on crm.v_conversation_last_message to authenticated, service_role;
