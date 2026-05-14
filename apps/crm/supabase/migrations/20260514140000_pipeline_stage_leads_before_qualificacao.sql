-- Etapa inicial "Leads" (novos leads); QUALIFICAÇÃO passa a ser a etapa seguinte no funil.
-- Novas oportunidades continuam a usar a primeira linha por sort_order (RPC crm_first_pipeline_stage_id).

begin;

-- 1) Criar etapa Leads antes de QUALIFICAÇÃO (sort_order mais baixo).
insert into crm.pipeline_stages (name, sort_order, is_final)
select 'Leads', 5, false
where not exists (select 1 from crm.pipeline_stages ps where ps.name = 'Leads');

update crm.pipeline_stages
set sort_order = 5
where name = 'Leads';

-- 2) Manter QUALIFICAÇÃO logo a seguir (compatível com AMOSTRA em 20, etc.).
update crm.pipeline_stages
set sort_order = 10
where name = 'QUALIFICAÇÃO';

-- 3) Oportunidades que estavam em QUALIFICAÇÃO passam para Leads (backlog actual de entradas).
update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'Leads' limit 1),
  updated_at = now()
where o.stage_id = (select id from crm.pipeline_stages where name = 'QUALIFICAÇÃO' limit 1);

commit;
