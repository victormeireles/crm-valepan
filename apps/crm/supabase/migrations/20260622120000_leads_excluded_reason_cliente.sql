-- Permite arquivar contato como cliente (não prospecto).

begin;

alter table crm.leads
  drop constraint if exists leads_excluded_reason_allowed;

alter table crm.leads
  add constraint leads_excluded_reason_allowed
  check (
    excluded_reason is null
    or excluded_reason in ('interno', 'fornecedor', 'cliente', 'outro')
  );

commit;
