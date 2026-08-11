-- Eventos de chamada do WhatsApp são itens de sistema na conversa, não mensagens.
alter table crm.messages
  add column if not exists event_kind text
    check (event_kind in ('whatsapp_call')),
  add column if not exists event_status text
    check (event_status in ('ringing', 'missed_voice', 'missed_video')),
  add column if not exists provider_call_id text;

create unique index if not exists idx_messages_provider_call_id
  on crm.messages (provider_call_id)
  where provider_call_id is not null;

comment on column crm.messages.event_kind is
  'Tipo de evento de sistema exibido na timeline; não representa uma mensagem de chat.';
comment on column crm.messages.event_status is
  'Estado atual do evento de sistema, incluindo chamadas em andamento ou perdidas.';
comment on column crm.messages.provider_call_id is
  'Identificador estável da chamada no provedor; permite atualizar o mesmo cartão.';

alter table crm.tasks
  add column if not exists source_key text;

create unique index if not exists idx_tasks_source_key
  on crm.tasks (source_key)
  where source_key is not null;

comment on column crm.tasks.source_key is
  'Chave idempotente para tarefas automáticas criadas por integrações.';

create or replace view crm.v_conversation_last_message as
select
  c.id as conversation_id,
  c.lead_id,
  latest.direction::text as last_direction,
  latest.sent_at as last_sent_at,
  left(coalesce(latest.body, ''), 500) as last_body_preview,
  inbound.sent_at as last_inbound_sent_at,
  latest.event_kind,
  latest.event_status
from crm.conversations c
inner join lateral (
  select m.direction, m.sent_at, m.body, m.event_kind, m.event_status
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
  'Último item e última entrada por conversa, incluindo eventos de chamada do WhatsApp.';

grant select on crm.v_conversation_last_message to authenticated, service_role;
