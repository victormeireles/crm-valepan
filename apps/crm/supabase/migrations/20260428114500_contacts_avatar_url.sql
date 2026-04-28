alter table crm.contacts
  add column if not exists avatar_url text;

alter table crm.contacts
  add column if not exists avatar_updated_at timestamptz;
