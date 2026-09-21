-- Catálogo de motivos de perda, editável em Configurações.

begin;

create table crm.lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_reasons_name_not_blank check (length(trim(name)) > 0)
);

create unique index lost_reasons_name_unique
  on crm.lost_reasons (lower(trim(name)));

create index idx_lost_reasons_active_sort
  on crm.lost_reasons (active, sort_order, name);

comment on table crm.lost_reasons is
  'Motivos de perda do funil, gerenciados em Configurações sem alterar código.';

insert into crm.lost_reasons (name, sort_order)
values
  ('Não inaugurou', 10),
  ('Sem pedido mínimo', 20),
  ('Não responde', 30),
  ('Sem interesse', 40),
  ('Não atendemos a região', 50),
  ('Não temos o pão', 60),
  ('Região não atendida', 70),
  ('Produto não disponível', 80),
  ('Já era cliente', 90),
  ('Volume insuficiente', 100),
  ('Preço', 110),
  ('Prazo', 120),
  ('Outro', 130);

alter table crm.lost_reasons enable row level security;

create policy lost_reasons_select on crm.lost_reasons
  for select to authenticated using (true);

create policy lost_reasons_write on crm.lost_reasons
  for all to authenticated
  using (crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role))
  with check (crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role));

grant select, insert, update, delete on table crm.lost_reasons to authenticated;
grant all on table crm.lost_reasons to service_role;

commit;
