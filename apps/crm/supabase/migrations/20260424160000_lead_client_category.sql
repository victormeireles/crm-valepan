-- Categoria comercial do lead (segmentação simples)
alter table crm.leads
  add column if not exists client_category text;

alter table crm.leads
  drop constraint if exists leads_client_category_allowed;

alter table crm.leads
  add constraint leads_client_category_allowed
  check (
    client_category is null
    or client_category in ('hamburgueria', 'distribuidor', 'parceiros', 'outros')
  );
