-- Tarefas modelo criadas ao entrar numa etapa do funil (uma vez por oportunidade + modelo).

begin;

create table crm.pipeline_stage_task_templates (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references crm.pipeline_stages (id) on delete cascade,
  title text not null,
  due_days_offset int,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pipeline_stage_task_templates_unique_title unique (stage_id, title)
);

create index idx_pipeline_stage_task_templates_stage
  on crm.pipeline_stage_task_templates (stage_id, active, sort_order);

comment on table crm.pipeline_stage_task_templates is
  'Tarefas criadas automaticamente quando a oportunidade entra na etapa.';
comment on column crm.pipeline_stage_task_templates.due_days_offset is
  'Dias a partir de agora para due_at; null = sem prazo.';

create table crm.pipeline_stage_automation_log (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references crm.opportunities (id) on delete cascade,
  template_id uuid not null references crm.pipeline_stage_task_templates (id) on delete cascade,
  task_id uuid references crm.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pipeline_stage_automation_log_unique unique (opportunity_id, template_id)
);

create index idx_pipeline_stage_automation_log_opp
  on crm.pipeline_stage_automation_log (opportunity_id);

-- Modelos padrão por nome da etapa (idempotente).
insert into crm.pipeline_stage_task_templates (stage_id, title, due_days_offset, sort_order)
select ps.id, v.title, v.due_days, v.sort_order
from crm.pipeline_stages ps
inner join (
  values
    ('QUALIFICAÇÃO', 'Ligar para qualificar necessidade', 1, 10),
    ('QUALIFICAÇÃO', 'Registrar volume e tipo de pão no CRM', 2, 20),
    ('AMOSTRA', 'Confirmar endereço e janela de entrega da amostra', 0, 10),
    ('AMOSTRA', 'Follow-up após envio da amostra', 5, 20),
    ('NEGOCIAÇÃO', 'Enviar proposta / condições comerciais', 2, 10),
    ('NEGOCIAÇÃO', 'Follow-up da negociação', 5, 20),
    ('ENCAMINHADO PARA DISTRIBUIDOR', 'Avisar distribuidor sobre o lead', 1, 10),
    ('ENCAMINHADO PARA DISTRIBUIDOR', 'Confirmar recebimento com o lead', 3, 20)
) as v(stage_name, title, due_days, sort_order)
  on ps.name = v.stage_name
where not exists (
  select 1
  from crm.pipeline_stage_task_templates t
  where t.stage_id = ps.id and t.title = v.title
);

alter table crm.pipeline_stage_task_templates enable row level security;
alter table crm.pipeline_stage_automation_log enable row level security;

create policy pipeline_stage_task_templates_select on crm.pipeline_stage_task_templates
  for select to authenticated using (true);

create policy pipeline_stage_task_templates_write on crm.pipeline_stage_task_templates
  for all to authenticated
  using (crm.current_role() = 'admin')
  with check (crm.current_role() = 'admin');

create policy pipeline_stage_automation_log_all on crm.pipeline_stage_automation_log
  for all to authenticated using (true) with check (true);

grant select on crm.pipeline_stage_task_templates to authenticated;
grant select, insert on crm.pipeline_stage_automation_log to authenticated;
grant all on crm.pipeline_stage_task_templates to service_role;
grant all on crm.pipeline_stage_automation_log to service_role;

commit;
