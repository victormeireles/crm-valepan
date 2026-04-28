-- Campos adicionais para logística / cadastro de amostra na UI
alter table crm.sample_shipments
  add column if not exists send_via text;

alter table crm.sample_shipments
  add column if not exists network text;

alter table crm.sample_shipments
  add column if not exists business_hours text;

alter table crm.sample_shipments
  add column if not exists bread_type text;
