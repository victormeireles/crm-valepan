-- Quem já aplicou 20260514140000 com o nome "Leads" passa a "LEADS" (idempotente).

begin;

update crm.pipeline_stages
set name = 'LEADS'
where name = 'Leads';

commit;
