-- Evita varreduras completas na busca do Funil. Os candidatos são encontrados
-- primeiro em índices trigram, antes dos joins e dos cálculos dos cartões.
begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function crm.phone_search_digits(p_value text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = crm, public
as $$
  select regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
$$;

create or replace function crm.phone_search_national_digits(p_value text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = crm, public
as $$
  select case
    when crm.phone_search_digits(p_value) like '55%'
      and length(crm.phone_search_digits(p_value)) in (12, 13)
      then substring(crm.phone_search_digits(p_value) from 3)
    else crm.phone_search_digits(p_value)
  end;
$$;

create or replace function crm.phone_search_alternate_digits(p_value text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = crm, public
as $$
  select case
    when length(crm.phone_search_national_digits(p_value)) = 11
      and substring(crm.phone_search_national_digits(p_value) from 3 for 1) = '9'
      and substring(crm.phone_search_national_digits(p_value) from 4 for 1) ~ '[6-9]'
      then substring(crm.phone_search_national_digits(p_value) from 1 for 2)
        || substring(crm.phone_search_national_digits(p_value) from 4)
    when length(crm.phone_search_national_digits(p_value)) = 10
      and substring(crm.phone_search_national_digits(p_value) from 3 for 1) ~ '[6-9]'
      then substring(crm.phone_search_national_digits(p_value) from 1 for 2)
        || '9' || substring(crm.phone_search_national_digits(p_value) from 3)
    when length(crm.phone_search_national_digits(p_value)) = 9
      and substring(crm.phone_search_national_digits(p_value) from 1 for 1) = '9'
      and substring(crm.phone_search_national_digits(p_value) from 2 for 1) ~ '[6-9]'
      then substring(crm.phone_search_national_digits(p_value) from 2)
    when length(crm.phone_search_national_digits(p_value)) = 8
      and substring(crm.phone_search_national_digits(p_value) from 1 for 1) ~ '[6-9]'
      then '9' || crm.phone_search_national_digits(p_value)
    else null
  end;
$$;

create index if not exists idx_contacts_full_name_trgm
  on crm.contacts using gin (full_name extensions.gin_trgm_ops);
create index if not exists idx_companies_name_trgm
  on crm.companies using gin (name extensions.gin_trgm_ops);
create index if not exists idx_opportunities_title_trgm
  on crm.opportunities using gin (title extensions.gin_trgm_ops);
create index if not exists idx_leads_phone_search_trgm
  on crm.leads using gin ((crm.phone_search_digits(phone_e164)) extensions.gin_trgm_ops);
create index if not exists idx_leads_phone_national_search_trgm
  on crm.leads using gin ((crm.phone_search_national_digits(phone_e164)) extensions.gin_trgm_ops);
create index if not exists idx_opportunities_title_phone_search_trgm
  on crm.opportunities using gin ((crm.phone_search_digits(title)) extensions.gin_trgm_ops);
create index if not exists idx_opportunities_title_phone_national_search_trgm
  on crm.opportunities using gin ((crm.phone_search_national_digits(title)) extensions.gin_trgm_ops);
create index if not exists idx_leads_contact_id
  on crm.leads (contact_id) where contact_id is not null;
create index if not exists idx_leads_company_id
  on crm.leads (company_id) where company_id is not null;

create or replace function crm.pipeline_filtered_cards(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null
)
returns table (
  opportunity_id uuid, title text, lead_id uuid, stage_id uuid, lost_reason text,
  opportunity_owner_id uuid, lead_owner_id uuid, opportunity_updated_at timestamptz,
  next_action_at timestamptz, stage_is_final boolean, phone_e164 text,
  client_category text, distributor_id uuid, network_type text, contact_name text,
  company_name text, distributor_name text, company_city text, company_state text,
  weekly_bread_consumption integer, bread_weight_grams integer,
  conversation_id uuid, last_direction text, last_sent_at timestamptz
)
language sql stable security invoker set search_path = crm, public
as $$
  with search_parameters as (
    select
      nullif(trim(coalesce(p_query, '')), '') as query_text,
      crm.phone_search_digits(p_query) as query_digits,
      crm.phone_search_national_digits(p_query) as query_national_digits,
      crm.phone_search_alternate_digits(p_query) as alternate_digits
  ),
  search_opportunities as materialized (
    select opportunity.id
    from search_parameters parameter
    join crm.opportunities opportunity
      on parameter.query_text is not null
      and opportunity.title ilike '%' || parameter.query_text || '%'

    union

    select opportunity.id
    from search_parameters parameter
    join crm.opportunities opportunity
      on length(parameter.query_digits) >= 4
      and (
        crm.phone_search_digits(opportunity.title) like '%' || parameter.query_digits || '%'
        or crm.phone_search_national_digits(opportunity.title) like '%' || parameter.query_national_digits || '%'
        or (parameter.alternate_digits is not null
          and crm.phone_search_national_digits(opportunity.title) like '%' || parameter.alternate_digits)
      )

    union

    select opportunity.id
    from search_parameters parameter
    join crm.contacts contact
      on parameter.query_text is not null
      and contact.full_name ilike '%' || parameter.query_text || '%'
    join crm.leads lead on lead.contact_id = contact.id
    join crm.opportunities opportunity on opportunity.lead_id = lead.id

    union

    select opportunity.id
    from search_parameters parameter
    join crm.companies company
      on parameter.query_text is not null
      and company.name ilike '%' || parameter.query_text || '%'
    join crm.leads lead on lead.company_id = company.id
    join crm.opportunities opportunity on opportunity.lead_id = lead.id

    union

    select opportunity.id
    from search_parameters parameter
    join crm.leads lead
      on length(parameter.query_digits) >= 4
      and (
        crm.phone_search_digits(lead.phone_e164) like '%' || parameter.query_digits || '%'
        or crm.phone_search_national_digits(lead.phone_e164) like '%' || parameter.query_national_digits || '%'
        or (parameter.alternate_digits is not null
          and crm.phone_search_national_digits(lead.phone_e164) like '%' || parameter.alternate_digits)
      )
    join crm.opportunities opportunity on opportunity.lead_id = lead.id
  )
  select
    o.id, o.title, o.lead_id, o.stage_id, o.lost_reason, o.owner_id, l.owner_id,
    o.updated_at, o.next_action_at, ps.is_final, l.phone_e164, l.client_category,
    l.distributor_id, l.network_type, contact.full_name, company.name, distributor.name,
    company.city, company.state, l.weekly_bread_consumption, l.bread_weight_grams,
    last_message.conversation_id, last_message.last_direction, last_message.last_sent_at
  from search_parameters parameter
  cross join crm.opportunities o
  inner join crm.leads l on l.id = o.lead_id
  inner join crm.pipeline_stages ps on ps.id = o.stage_id
  left join search_opportunities search_result on search_result.id = o.id
  left join lateral (
    select message.conversation_id, message.last_direction, message.last_sent_at
    from crm.v_conversation_last_message message
    where message.lead_id = l.id
      and message.last_sent_at >= p_messages_visible_since
    order by message.last_sent_at desc
    limit 1
  ) last_message on true
  left join crm.contacts contact on contact.id = l.contact_id
  left join crm.companies company on company.id = l.company_id
  left join crm.distributors distributor on distributor.id = l.distributor_id
  where l.excluded_from_pipeline_at is null
    and (
      last_message.conversation_id is not null
      or exists (select 1 from crm.lead_registrations registration where registration.lead_id = l.id)
    )
    and (p_stage_id is null or o.stage_id = p_stage_id)
    and (p_owner_user_id is null or coalesce(o.owner_id, l.owner_id) = p_owner_user_id)
    and (
      p_signal is null
      or (p_signal = 'awaiting_reply' and last_message.last_direction = 'in')
      or (p_signal = 'replied' and last_message.last_direction = 'out')
      or (p_signal = 'stale' and not ps.is_final and o.updated_at <= now() - interval '7 days')
      or (p_signal = 'followup_overdue' and not ps.is_final and o.next_action_at < now())
    )
    and (
      p_region is null
      or (p_region = 'sp' and substring(crm.phone_search_national_digits(l.phone_e164) from 1 for 2) = '11')
      or (p_region = 'rj' and substring(crm.phone_search_national_digits(l.phone_e164) from 1 for 2) = '21')
    )
    and (
      p_client_category is null
      or (p_client_category = 'distribuidor' and (
        lower(trim(coalesce(l.client_category, ''))) = 'distribuidor'
        or l.distributor_id is not null
        or lower(trim(coalesce(l.network_type, ''))) = 'distribuidor'
      ))
      or (p_client_category <> 'distribuidor'
        and lower(trim(coalesce(l.client_category, ''))) = p_client_category)
    )
    and (parameter.query_text is null or search_result.id is not null)
    and (
      p_volume is null
      or (p_volume = 'informado' and l.weekly_bread_consumption is not null)
      or (p_volume = 'ate_100' and l.weekly_bread_consumption is not null
        and l.weekly_bread_consumption <= 100)
      or (p_volume = 'acima_100' and l.weekly_bread_consumption is not null
        and l.weekly_bread_consumption > 100)
    );
$$;

revoke all on function crm.phone_search_digits(text) from public;
revoke all on function crm.phone_search_national_digits(text) from public;
revoke all on function crm.phone_search_alternate_digits(text) from public;
grant execute on function crm.phone_search_digits(text) to authenticated, service_role;
grant execute on function crm.phone_search_national_digits(text) to authenticated, service_role;
grant execute on function crm.phone_search_alternate_digits(text) to authenticated, service_role;

commit;
