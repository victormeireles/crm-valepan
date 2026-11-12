-- Respostas rápidas do chat, editáveis em Configurações.

begin;

create table crm.message_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_title_not_blank check (length(trim(title)) > 0),
  constraint message_templates_body_not_blank check (length(trim(body)) > 0)
);

create unique index message_templates_title_unique
  on crm.message_templates (lower(trim(title)));

create index idx_message_templates_active_sort
  on crm.message_templates (active, sort_order, title);

comment on table crm.message_templates is
  'Respostas rápidas do inbox, gerenciadas em Configurações. Use {{primeiro_nome}} no corpo.';

insert into crm.message_templates (title, body, sort_order)
values
  (
    'Tabela de preços',
    'Olá, {{primeiro_nome}}! Vou te enviar nossa tabela de preços atualizada. Se quiser, também posso ajudar a escolher os produtos ideais para o seu negócio.',
    10
  ),
  (
    'Enviar amostra',
    'Olá, {{primeiro_nome}}! Podemos organizar o envio de uma amostra para você conhecer a qualidade dos produtos Valepan. Qual é o melhor endereço e horário para receber?',
    20
  ),
  (
    'Prazo de entrega',
    'Olá, {{primeiro_nome}}! Nosso prazo de entrega depende da região e do volume do pedido. Me confirme sua cidade e a quantidade desejada para eu consultar a melhor data.',
    30
  ),
  (
    'Pedido mínimo',
    'Olá, {{primeiro_nome}}! Vou confirmar o pedido mínimo disponível para sua região. Você consegue me dizer o volume semanal aproximado do seu negócio?',
    40
  ),
  (
    'Catálogo completo',
    'Olá, {{primeiro_nome}}! Vou te enviar o catálogo completo da Valepan. Se me contar quais produtos procura, também separo uma seleção mais objetiva para você.',
    50
  );

alter table crm.message_templates enable row level security;

create policy message_templates_select on crm.message_templates
  for select to authenticated using (true);

create policy message_templates_write on crm.message_templates
  for all to authenticated
  using (crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role))
  with check (crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role));

grant select, insert, update, delete on table crm.message_templates to authenticated;
grant all on table crm.message_templates to service_role;

commit;
