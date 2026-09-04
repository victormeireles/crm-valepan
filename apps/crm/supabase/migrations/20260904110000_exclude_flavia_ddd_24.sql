-- Remove o DDD 24 da carteira visível para a Flávia em todo o CRM.
-- Administração e gestão continuam com visão completa.

begin;

create or replace function crm.is_rj_or_mg_phone(p_phone text)
returns boolean
language sql
immutable
strict
as $$
  select regexp_replace(p_phone, '[^0-9]', '', 'g') ~
    '^(55)?(21|22|31|32|33|34|35|37|38)';
$$;

comment on function crm.is_rj_or_mg_phone(text) is
  'Filtro provisório da Flávia: aceita os DDDs 21 e 22 e os DDDs 31, 32, 33, 34, 35, 37 e 38; o DDD 24 fica excluído.';

-- O recorte regional já protegia chat e funil. Aplicá-lo também diretamente
-- aos leads impede que o DDD 24 apareça na carteira, nas buscas e nos painéis.
drop policy if exists leads_select_by_seller on crm.leads;
create policy leads_select_by_seller on crm.leads
  for select to authenticated
  using (crm.can_view_flavia_sales_lead(id));

comment on function crm.can_view_flavia_sales_lead(uuid) is
  'Administração e gestão veem tudo; somente a Flávia fica limitada aos DDDs 21, 22, 31, 32, 33, 34, 35, 37 e 38 em todo o CRM.';

commit;
