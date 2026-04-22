-- Primeira etapa do funil via função em `public`: o PostgREST sempre expõe `public`;
-- assim o webhook não depende só de `crm` estar em "Exposed schemas" na API.
create or replace function public.crm_first_pipeline_stage_id()
returns uuid
language sql
stable
security definer
set search_path = crm, public
as $$
  select id
  from crm.pipeline_stages
  order by sort_order asc
  limit 1;
$$;

revoke all on function public.crm_first_pipeline_stage_id() from public;
grant execute on function public.crm_first_pipeline_stage_id() to service_role;
grant execute on function public.crm_first_pipeline_stage_id() to authenticated;
