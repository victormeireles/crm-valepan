-- Remove catálogo CRM de distribuidores após backfill para public.clientes / companies.

begin;

-- Garante que não restam vínculos antes do drop.
do $$
begin
  if exists (select 1 from crm.leads where distributor_id is not null) then
    raise exception 'Ainda existem leads.distributor_id; rode o backfill antes do drop.';
  end if;
  if exists (select 1 from crm.opportunities where distributor_id is not null) then
    update crm.opportunities set distributor_id = null where distributor_id is not null;
  end if;
end $$;

alter table crm.leads drop column if exists distributor_id;
alter table crm.opportunities drop column if exists distributor_id;

drop policy if exists distributor_regions_all on crm.distributor_regions;
drop policy if exists distributors_all on crm.distributors;

drop table if exists crm.distributor_regions;
drop table if exists crm.distributors;

commit;
