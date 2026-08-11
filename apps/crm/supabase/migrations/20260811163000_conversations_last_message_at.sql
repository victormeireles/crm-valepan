-- Mantém a ordem da Inbox baseada na chegada real das mensagens.

begin;

alter table crm.conversations
  add column if not exists last_message_at timestamptz;

update crm.conversations c
set last_message_at = latest.last_message_at
from (
  select conversation_id, max(sent_at) as last_message_at
  from crm.messages
  group by conversation_id
) latest
where latest.conversation_id = c.id
  and c.last_message_at is distinct from latest.last_message_at;

create index if not exists idx_conversations_kind_last_message
  on crm.conversations (conversation_kind, last_message_at desc nulls last, created_at desc);

create or replace function crm.refresh_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  target_conversation_id uuid;
begin
  target_conversation_id := coalesce(new.conversation_id, old.conversation_id);

  update crm.conversations
  set last_message_at = (
    select max(sent_at)
    from crm.messages
    where conversation_id = target_conversation_id
  )
  where id = target_conversation_id;

  if tg_op = 'UPDATE' and old.conversation_id is distinct from new.conversation_id then
    update crm.conversations
    set last_message_at = (
      select max(sent_at)
      from crm.messages
      where conversation_id = old.conversation_id
    )
    where id = old.conversation_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_messages_refresh_conversation_last_message_at on crm.messages;
create trigger trg_messages_refresh_conversation_last_message_at
after insert or update of sent_at, conversation_id or delete on crm.messages
for each row execute function crm.refresh_conversation_last_message_at();

commit;
