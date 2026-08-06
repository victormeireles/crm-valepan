create temporary table crm_explain_results (
  position bigserial,
  query_name text not null,
  plan_line text not null
) on commit drop;

do $$
declare
  plan_line text;
begin
  for plan_line in execute $plan$
    explain (analyze, buffers, format text)
    select id from crm.leads
    where excluded_from_pipeline_at is null
    order by updated_at desc
    limit 50
  $plan$ loop
    insert into crm_explain_results (query_name, plan_line)
    values ('leads_active', plan_line);
  end loop;

  for plan_line in execute $plan$
    explain (analyze, buffers, format text)
    select id from crm.leads
    where excluded_from_pipeline_at is null
      and client_category = (
        select client_category from crm.leads
        where client_category is not null
        group by client_category
        order by count(*) desc
        limit 1
      )
    order by updated_at desc
    limit 50
  $plan$ loop
    insert into crm_explain_results (query_name, plan_line)
    values ('leads_by_category', plan_line);
  end loop;

  for plan_line in execute $plan$
    explain (analyze, buffers, format text)
    select id from crm.opportunities
    where owner_id = (
      select owner_id from crm.opportunities
      where owner_id is not null
      group by owner_id
      order by count(*) desc
      limit 1
    )
    order by updated_at desc
    limit 60
  $plan$ loop
    insert into crm_explain_results (query_name, plan_line)
    values ('pipeline_by_owner', plan_line);
  end loop;

  for plan_line in execute $plan$
    explain (analyze, buffers, format text)
    select id from crm.tasks
    where lead_id = (
      select lead_id from crm.tasks
      where lead_id is not null
      group by lead_id
      order by count(*) desc
      limit 1
    )
    order by done, due_at nulls last
  $plan$ loop
    insert into crm_explain_results (query_name, plan_line)
    values ('tasks_by_lead', plan_line);
  end loop;

  for plan_line in execute $plan$
    explain (analyze, buffers, format text)
    select count(*) from crm.messages
    where sent_at >= now() - interval '7 days'
  $plan$ loop
    insert into crm_explain_results (query_name, plan_line)
    values ('messages_last_7_days', plan_line);
  end loop;
end
$$;

select query_name, string_agg(plan_line, E'\n' order by position) as query_plan
from crm_explain_results
group by query_name
order by query_name;
