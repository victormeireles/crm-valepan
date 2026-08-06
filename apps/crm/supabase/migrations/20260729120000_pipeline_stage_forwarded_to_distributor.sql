-- Inclui "Encaminhado para distribuidor" como a 7ª etapa ativa do funil.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'ENCAMINHADO PARA DISTRIBUIDOR', 70, false
where not exists (
  select 1
  from crm.pipeline_stages
  where name = 'ENCAMINHADO PARA DISTRIBUIDOR'
);

update crm.pipeline_stages
set sort_order = 70, is_final = false
where name = 'ENCAMINHADO PARA DISTRIBUIDOR';

insert into crm.pipeline_stage_task_templates
  (stage_id, title, due_days_offset, sort_order)
select ps.id, v.title, v.due_days, v.sort_order
from crm.pipeline_stages ps
inner join (
  values
    ('Avisar distribuidor sobre o lead', 1, 10),
    ('Confirmar recebimento com o lead', 3, 20),
    ('Cobrar retorno do distribuidor', 5, 30)
) as v(title, due_days, sort_order)
  on true
where ps.name = 'ENCAMINHADO PARA DISTRIBUIDOR'
  and not exists (
    select 1
    from crm.pipeline_stage_task_templates t
    where t.stage_id = ps.id and t.title = v.title
  );

commit;
