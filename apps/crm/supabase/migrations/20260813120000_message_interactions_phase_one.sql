alter table crm.messages
  add column if not exists reply_to_message_id uuid references crm.messages (id) on delete set null,
  add column if not exists reaction text;

create index if not exists idx_messages_reply_to
  on crm.messages (reply_to_message_id)
  where reply_to_message_id is not null;
