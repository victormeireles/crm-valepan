-- Remove etapas que não fazem mais parte da classificação do funil.

begin;

-- Preserva as oportunidades existentes em etapas equivalentes ainda ativas.
update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'QUALIFICAÇÃO' limit 1),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name = 'SOLUÇÃO COMERCIAL'
)
and exists (
  select 1 from crm.pipeline_stages where name = 'QUALIFICAÇÃO'
);

update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'NEGOCIAÇÃO' limit 1),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name = 'PRIMEIRO PEDIDO'
)
and exists (
  select 1 from crm.pipeline_stages where name = 'NEGOCIAÇÃO'
);

delete from crm.pipeline_stages
where name in ('SOLUÇÃO COMERCIAL', 'PRIMEIRO PEDIDO');

commit;
