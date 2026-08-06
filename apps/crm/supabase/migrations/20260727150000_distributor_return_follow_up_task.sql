-- Cria um acompanhamento sete dias depois de o lead ser encaminhado ao distribuidor.
-- A etapa foi renomeada para SOLUÇÃO COMERCIAL em 20260727140000, mas o nome
-- anterior continua aceito para tornar esta migração segura em ambientes defasados.

begin;

insert into crm.pipeline_stage_task_templates (
  stage_id,
  title,
  due_days_offset,
  sort_order
)
select
  ps.id,
  'VERIFICAR RETORNO DISTRIBUIDOR',
  7,
  30
from crm.pipeline_stages ps
where ps.name in ('SOLUÇÃO COMERCIAL', 'ENCAMINHADO PARA DISTRIBUIDOR')
on conflict (stage_id, title) do update
set
  due_days_offset = excluded.due_days_offset,
  sort_order = excluded.sort_order,
  active = true;

-- Se a tarefa já tiver sido criada manualmente, apenas registra que a automação
-- foi atendida. Isso impede uma segunda tarefa com o mesmo propósito.
insert into crm.pipeline_stage_automation_log (
  opportunity_id,
  template_id,
  task_id
)
select distinct on (o.id, tpl.id)
  o.id,
  tpl.id,
  t.id
from crm.opportunities o
inner join crm.pipeline_stages ps
  on ps.id = o.stage_id
inner join crm.pipeline_stage_task_templates tpl
  on tpl.stage_id = ps.id
 and tpl.title = 'VERIFICAR RETORNO DISTRIBUIDOR'
inner join crm.tasks t
  on t.opportunity_id = o.id
 and t.title = tpl.title
left join crm.pipeline_stage_automation_log automation
  on automation.opportunity_id = o.id
 and automation.template_id = tpl.id
where ps.name in ('SOLUÇÃO COMERCIAL', 'ENCAMINHADO PARA DISTRIBUIDOR')
  and automation.id is null
order by o.id, tpl.id, t.created_at desc
on conflict (opportunity_id, template_id) do nothing;

-- Regulariza as oportunidades que já estão na etapa. O vencimento parte da
-- entrada mais recente registrada no histórico; na ausência dela, usa updated_at.
with pending as (
  select
    o.id as opportunity_id,
    o.lead_id,
    tpl.id as template_id,
    coalesce(o.owner_id, l.owner_id) as assignee_id,
    (
      coalesce(
        (
          select max(log.created_at)
          from crm.activity_logs log
          where log.entity_type = 'opportunity'
            and log.entity_id = o.id
            and log.action = 'stage_changed'
            and log.payload ->> 'stage_id' = ps.id::text
        ),
        o.updated_at,
        now()
      ) + interval '7 days'
    ) as due_at
  from crm.opportunities o
  inner join crm.pipeline_stages ps
    on ps.id = o.stage_id
  inner join crm.pipeline_stage_task_templates tpl
    on tpl.stage_id = ps.id
   and tpl.title = 'VERIFICAR RETORNO DISTRIBUIDOR'
   and tpl.active = true
  left join crm.leads l
    on l.id = o.lead_id
  left join crm.pipeline_stage_automation_log automation
    on automation.opportunity_id = o.id
   and automation.template_id = tpl.id
  where ps.name in ('SOLUÇÃO COMERCIAL', 'ENCAMINHADO PARA DISTRIBUIDOR')
    and automation.id is null
),
created_tasks as (
  insert into crm.tasks (
    title,
    due_at,
    assignee_id,
    done,
    lead_id,
    opportunity_id
  )
  select
    'VERIFICAR RETORNO DISTRIBUIDOR',
    pending.due_at,
    pending.assignee_id,
    false,
    pending.lead_id,
    pending.opportunity_id
  from pending
  returning id, opportunity_id
)
insert into crm.pipeline_stage_automation_log (
  opportunity_id,
  template_id,
  task_id
)
select
  created.opportunity_id,
  pending.template_id,
  created.id
from created_tasks created
inner join pending
  on pending.opportunity_id = created.opportunity_id
on conflict (opportunity_id, template_id) do nothing;

commit;
