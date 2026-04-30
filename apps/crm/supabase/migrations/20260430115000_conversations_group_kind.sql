alter table crm.conversations
  add column if not exists conversation_kind text not null default 'lead';

update crm.conversations
set conversation_kind = 'lead'
where conversation_kind is distinct from 'lead'
  and lead_id is not null;

alter table crm.conversations
  alter column lead_id drop not null;

alter table crm.conversations
  drop constraint if exists conversations_conversation_kind_check;

alter table crm.conversations
  add constraint conversations_conversation_kind_check
  check (conversation_kind in ('lead', 'group'));

create index if not exists idx_conversations_kind_updated_at
  on crm.conversations (conversation_kind, updated_at desc);
