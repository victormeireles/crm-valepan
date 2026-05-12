begin;

alter table crm.messages
  add column if not exists message_status text
    check (message_status in ('sent', 'read')),
  add column if not exists read_at timestamptz;

alter table crm.conversations
  add column if not exists group_display_name text;

comment on column crm.messages.message_status is
  'Status de entrega exibido no chat (sent, read).';
comment on column crm.messages.read_at is
  'Momento em que o provedor confirmou leitura da mensagem.';
comment on column crm.conversations.group_display_name is
  'Nome do grupo no WhatsApp para exibição no inbox.';

update crm.messages
set message_status = coalesce(message_status, 'sent')
where direction = 'out';

create index if not exists idx_messages_provider_status
  on crm.messages (provider_message_id, message_status);

create index if not exists idx_conversations_group_display_name
  on crm.conversations (group_display_name);

commit;
