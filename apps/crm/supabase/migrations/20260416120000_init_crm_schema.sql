-- Schema CRM — tabelas e RLS (V1 MVP)
-- Extensões úteis
create extension if not exists "pgcrypto";

create schema if not exists crm;

-- Perfis (ligados a auth.users)
create type crm.user_role as enum (
  'admin',
  'comercial',
  'gestao',
  'operacao'
);

create table crm.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role crm.user_role not null default 'comercial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references crm.companies (id) on delete set null,
  full_name text,
  phone_e164 text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_e164)
);

create table crm.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.distributor_regions (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references crm.distributors (id) on delete cascade,
  region_name text not null,
  state text,
  created_at timestamptz not null default now()
);

create table crm.leads (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  source text not null default 'whatsapp',
  company_id uuid references crm.companies (id) on delete set null,
  contact_id uuid references crm.contacts (id) on delete set null,
  owner_id uuid references crm.profiles (id) on delete set null,
  distributor_id uuid references crm.distributors (id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_leads_phone on crm.leads (phone_e164);
create index idx_leads_owner on crm.leads (owner_id);

create table crm.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create table crm.opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm.leads (id) on delete cascade,
  company_id uuid references crm.companies (id) on delete set null,
  stage_id uuid not null references crm.pipeline_stages (id),
  owner_id uuid references crm.profiles (id) on delete set null,
  distributor_id uuid references crm.distributors (id) on delete set null,
  title text,
  next_action_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_opportunities_lead on crm.opportunities (lead_id);
create index idx_opportunities_stage on crm.opportunities (stage_id);

create table crm.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm.leads (id) on delete cascade,
  channel text not null default 'whatsapp',
  external_id text,
  phone_e164 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, phone_e164)
);

create index idx_conversations_lead on crm.conversations (lead_id);

create table crm.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references crm.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text,
  provider_message_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_messages_conv on crm.messages (conversation_id, sent_at);
create unique index idx_messages_provider_id on crm.messages (provider_message_id)
  where provider_message_id is not null;

create table crm.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm.leads (id) on delete cascade,
  opportunity_id uuid references crm.opportunities (id) on delete cascade,
  title text not null,
  due_at timestamptz,
  assignee_id uuid references crm.profiles (id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_assignee on crm.tasks (assignee_id, done, due_at);

create table crm.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm.leads (id) on delete cascade,
  opportunity_id uuid references crm.opportunities (id) on delete cascade,
  author_id uuid references crm.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table crm.sample_shipments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm.leads (id) on delete set null,
  company_id uuid references crm.companies (id) on delete set null,
  contact_name text,
  address_line text,
  status text not null default 'requested',
  window_start timestamptz,
  window_end timestamptz,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.sample_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references crm.sample_shipments (id) on delete cascade,
  description text not null,
  qty numeric not null default 1,
  created_at timestamptz not null default now()
);

create table crm.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb,
  actor_id uuid references crm.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_activity_entity on crm.activity_logs (entity_type, entity_id, created_at);

-- Seed estágios padrão
insert into crm.pipeline_stages (name, sort_order, is_final) values
  ('Lead novo', 10, false),
  ('Qualificação', 20, false),
  ('Negociação', 40, false),
  ('Amostra', 50, false),
  ('Convertido', 100, true),
  ('Perdido', 110, true);

-- Trigger: novo usuário auth -> profile
create or replace function crm.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  insert into crm.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'comercial'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure crm.handle_new_user();

-- Service role / webhook pode inserir mensagens — políticas abaixo

alter table crm.profiles enable row level security;
alter table crm.companies enable row level security;
alter table crm.contacts enable row level security;
alter table crm.leads enable row level security;
alter table crm.pipeline_stages enable row level security;
alter table crm.opportunities enable row level security;
alter table crm.conversations enable row level security;
alter table crm.messages enable row level security;
alter table crm.tasks enable row level security;
alter table crm.notes enable row level security;
alter table crm.distributors enable row level security;
alter table crm.distributor_regions enable row level security;
alter table crm.sample_shipments enable row level security;
alter table crm.sample_items enable row level security;
alter table crm.activity_logs enable row level security;

-- Helper: usuário autenticado
create or replace function crm.is_authenticated()
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select auth.uid() is not null;
$$;

create or replace function crm.current_role()
returns crm.user_role
language sql
stable
security definer
set search_path = crm, public
as $$
  select role from crm.profiles where id = auth.uid();
$$;

-- Policies: leitura ampla para usuários logados; escrita conforme perfil
-- Admin: tudo
-- Demais: leitura em todas tabelas operacionais; insert/update nas mesmas

create policy profiles_select on crm.profiles
  for select to authenticated using (true);

create policy profiles_update_self on crm.profiles
  for update to authenticated using (id = auth.uid());

-- Companies & contacts
create policy companies_all on crm.companies
  for all to authenticated using (true) with check (true);

create policy contacts_all on crm.contacts
  for all to authenticated using (true) with check (true);

-- Leads
create policy leads_all on crm.leads
  for all to authenticated using (true) with check (true);

-- Pipeline stages: leitura para todos autenticados; escrita só admin (via service role ou policy)
create policy stages_select on crm.pipeline_stages
  for select to authenticated using (true);

create policy stages_write on crm.pipeline_stages
  for all to authenticated
  using (crm.current_role() = 'admin')
  with check (crm.current_role() = 'admin');

-- Opportunities
create policy opportunities_all on crm.opportunities
  for all to authenticated using (true) with check (true);

-- Conversations & messages
create policy conversations_all on crm.conversations
  for all to authenticated using (true) with check (true);

create policy messages_select on crm.messages
  for select to authenticated using (true);

create policy messages_insert on crm.messages
  for insert to authenticated with check (true);

-- Tasks, notes
create policy tasks_all on crm.tasks
  for all to authenticated using (true) with check (true);

create policy notes_all on crm.notes
  for all to authenticated using (true) with check (true);

-- Distributors
create policy distributors_all on crm.distributors
  for all to authenticated using (true) with check (true);

create policy distributor_regions_all on crm.distributor_regions
  for all to authenticated using (true) with check (true);

-- Samples
create policy samples_all on crm.sample_shipments
  for all to authenticated using (true) with check (true);

create policy sample_items_all on crm.sample_items
  for all to authenticated using (true) with check (true);

-- Activity logs
create policy activity_select on crm.activity_logs
  for select to authenticated using (true);

create policy activity_insert on crm.activity_logs
  for insert to authenticated with check (true);

-- Grant usage
grant usage on schema crm to authenticated, service_role;
grant all on all tables in schema crm to authenticated, service_role;
grant usage on type crm.user_role to authenticated, service_role;
