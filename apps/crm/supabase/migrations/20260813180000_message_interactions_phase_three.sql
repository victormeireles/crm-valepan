alter table crm.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_until timestamptz;

create table if not exists crm.message_favorites (
  message_id uuid not null references crm.messages (id) on delete cascade,
  user_id uuid not null references crm.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table crm.message_favorites enable row level security;

drop policy if exists message_favorites_own on crm.message_favorites;
create policy message_favorites_own on crm.message_favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists messages_update on crm.messages;
create policy messages_update on crm.messages
  for update to authenticated using (true) with check (true);
