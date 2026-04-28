alter table crm.leads
  add column if not exists network_type text;

alter table crm.leads
  drop constraint if exists leads_network_type_check;

alter table crm.leads
  add constraint leads_network_type_check
  check (
    network_type is null
    or network_type in ('distribuidor', 'representante comercial', 'operador logístico')
  );
