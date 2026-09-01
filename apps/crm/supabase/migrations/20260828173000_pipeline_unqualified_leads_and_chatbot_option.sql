-- Separa a entrada padrão LEADS da classificação opcional CHATBOT.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'LEADS', 1, false
where not exists (
  select 1 from crm.pipeline_stages where upper(trim(name)) = 'LEADS'
);

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'CHATBOT', 2, false
where not exists (
  select 1 from crm.pipeline_stages where upper(trim(name)) = 'CHATBOT'
);

update crm.pipeline_stages
set sort_order = 1, is_final = false
where upper(trim(name)) = 'LEADS';

update crm.pipeline_stages
set sort_order = 2, is_final = false
where upper(trim(name)) = 'CHATBOT';

-- CHATBOT era usado como entrada automática. Como essa classificação ainda não
-- existia na interface, os registros atuais nessa etapa são leads não qualificados.
update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where upper(trim(name)) = 'LEADS' limit 1),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where upper(trim(name)) = 'CHATBOT'
);

-- Novas oportunidades sempre começam em LEADS. CHATBOT só será usado quando
-- alguém selecionar explicitamente essa classificação.
create or replace function public.crm_first_pipeline_stage_id()
returns uuid
language sql
stable
security definer
set search_path = crm, public
as $$
  select id
  from crm.pipeline_stages
  where upper(trim(name)) = 'LEADS'
  limit 1;
$$;

revoke all on function public.crm_first_pipeline_stage_id() from public;
grant execute on function public.crm_first_pipeline_stage_id() to service_role;
grant execute on function public.crm_first_pipeline_stage_id() to authenticated;

commit;
