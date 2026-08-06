-- Separa etapas de trabalho dos resultados do funil.
-- Mantém IDs sempre que possível para preservar automações e histórico.

begin;

-- Etapas ativas.
update crm.pipeline_stages
set name = 'ENTRADA', sort_order = 10, is_final = false
where name = 'LEADS';

update crm.pipeline_stages
set sort_order = 20, is_final = false
where name = 'QUALIFICAÇÃO';

update crm.pipeline_stages
set name = 'SOLUÇÃO COMERCIAL', sort_order = 30, is_final = false
where name = 'ENCAMINHADO PARA DISTRIBUIDOR';

update crm.pipeline_stages
set sort_order = 40, is_final = false
where name = 'AMOSTRA';

update crm.pipeline_stages
set sort_order = 50, is_final = false
where name = 'NEGOCIAÇÃO';

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'PRIMEIRO PEDIDO', 60, false
where not exists (
  select 1 from crm.pipeline_stages where name = 'PRIMEIRO PEDIDO'
);

-- Resultados, exibidos fora do Kanban ativo.
update crm.pipeline_stages
set sort_order = 100, is_final = true
where name = 'CONVERTIDO';

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'PERDIDO', 110, true
where not exists (
  select 1 from crm.pipeline_stages where name = 'PERDIDO'
);

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'DESQUALIFICADO', 120, true
where not exists (
  select 1 from crm.pipeline_stages where name = 'DESQUALIFICADO'
);

-- Converte as antigas colunas de motivo em resultado + motivo.
update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'CONVERTIDO' limit 1),
  lost_reason = coalesce(o.lost_reason, 'Já era cliente'),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name = 'JÁ É CLIENTE'
);

update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'DESQUALIFICADO' limit 1),
  lost_reason = coalesce(
    o.lost_reason,
    case ps.name
      when 'NÃO ATENDEMOS A REGIÃO' then 'Região não atendida'
      when 'NÃO TEMOS O PÃO' then 'Produto não disponível'
      else ps.name
    end
  ),
  updated_at = now()
from crm.pipeline_stages ps
where o.stage_id = ps.id
  and ps.name in ('NÃO ATENDEMOS A REGIÃO', 'NÃO TEMOS O PÃO');

update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'PERDIDO' limit 1),
  lost_reason = coalesce(
    o.lost_reason,
    case ps.name
      when 'NÃO RESPONDE' then 'Não responde'
      when 'SEM INTERESSE' then 'Sem interesse'
      else ps.name
    end
  ),
  updated_at = now()
from crm.pipeline_stages ps
where o.stage_id = ps.id
  and ps.name in ('NÃO RESPONDE', 'SEM INTERESSE');

delete from crm.pipeline_stages
where name in (
  'JÁ É CLIENTE',
  'NÃO ATENDEMOS A REGIÃO',
  'NÃO RESPONDE',
  'NÃO TEMOS O PÃO',
  'SEM INTERESSE'
);

-- Novas automações coerentes com as etapas introduzidas.
insert into crm.pipeline_stage_task_templates
  (stage_id, title, due_days_offset, sort_order)
select ps.id, v.title, v.due_days, v.sort_order
from crm.pipeline_stages ps
inner join (
  values
    ('SOLUÇÃO COMERCIAL', 'Definir venda direta ou distribuidor', 1, 10),
    ('SOLUÇÃO COMERCIAL', 'Confirmar responsável pelo atendimento', 2, 20),
    ('PRIMEIRO PEDIDO', 'Confirmar dados e condições do primeiro pedido', 1, 10),
    ('PRIMEIRO PEDIDO', 'Acompanhar conclusão da primeira compra', 3, 20)
) as v(stage_name, title, due_days, sort_order)
  on ps.name = v.stage_name
where not exists (
  select 1
  from crm.pipeline_stage_task_templates t
  where t.stage_id = ps.id and t.title = v.title
);

commit;
