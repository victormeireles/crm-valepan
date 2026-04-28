-- Status operacional de amostra: pendente | enviado
alter table crm.sample_shipments
  drop constraint if exists sample_shipments_status_allowed;

update crm.sample_shipments
set status = case
  when status in ('delivered', 'enviado') then 'enviado'
  else 'pendente'
end;

alter table crm.sample_shipments
  alter column status set default 'pendente';

alter table crm.sample_shipments
  add constraint sample_shipments_status_allowed
  check (status in ('pendente', 'enviado'));
