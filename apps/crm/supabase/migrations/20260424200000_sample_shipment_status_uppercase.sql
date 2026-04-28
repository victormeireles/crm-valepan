-- Normaliza status para MAIÚSCULO (PENDENTE | ENVIADO)
alter table crm.sample_shipments
  drop constraint if exists sample_shipments_status_allowed;

update crm.sample_shipments
set status = case
  when lower(status) in ('enviado', 'delivered') then 'ENVIADO'
  else 'PENDENTE'
end;

alter table crm.sample_shipments
  alter column status set default 'PENDENTE';

alter table crm.sample_shipments
  add constraint sample_shipments_status_allowed
  check (status in ('PENDENTE', 'ENVIADO'));
