-- Uma única leitura compacta para a lista e os contadores do Inbox.
begin;

create index if not exists idx_conversations_phone_search_trgm
  on crm.conversations using gin ((crm.phone_search_digits(phone_e164)) extensions.gin_trgm_ops);

create or replace function crm.inbox_sidebar_snapshot(
  p_messages_visible_since timestamptz,
  p_tab text default 'qualify',
  p_offset integer default 0,
  p_limit integer default 40,
  p_query text default null
)
returns table (
  conversation_id uuid,
  phone_e164 text,
  conversation_kind text,
  group_display_name text,
  classification text,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  last_read_at timestamptz,
  lead_id uuid,
  client_category text,
  excluded_from_pipeline_at timestamptz,
  contact_name text,
  avatar_url text,
  company_name text,
  distributor_name text,
  stage_id uuid,
  weekly_bread_consumption integer,
  bread_weight_grams integer,
  last_direction text,
  last_sent_at timestamptz,
  last_body_preview text,
  event_kind text,
  event_status text,
  last_inbound_sent_at timestamptz,
  tab_total bigint,
  qualify_count bigint,
  archived_count bigint,
  groups_count bigint,
  pipeline_count bigint
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with entry_stages as (
    select id
    from crm.pipeline_stages
    where upper(trim(name)) in ('LEADS', 'ENTRADA')
  ),
  base as materialized (
    select
      c.id as conversation_id,
      c.phone_e164,
      c.conversation_kind,
      c.group_display_name,
      c.classification,
      c.last_message_at,
      c.created_at,
      c.updated_at,
      c.last_read_at,
      l.id as lead_id,
      l.client_category,
      l.excluded_from_pipeline_at,
      contact.full_name as contact_name,
      contact.avatar_url,
      company.name as company_name,
      distributor.name as distributor_name,
      opportunity.stage_id,
      l.weekly_bread_consumption,
      l.bread_weight_grams,
      latest.direction::text as last_direction,
      latest.sent_at as last_sent_at,
      left(coalesce(latest.body, ''), 500) as last_body_preview,
      latest.event_kind,
      latest.event_status,
      inbound.sent_at as last_inbound_sent_at
    from crm.conversations c
    left join crm.leads l on l.id = c.lead_id
    left join crm.contacts contact on contact.id = l.contact_id
    left join crm.companies company on company.id = l.company_id
    left join crm.distributors distributor on distributor.id = l.distributor_id
    left join lateral (
      select o.stage_id
      from crm.opportunities o
      where o.lead_id = l.id
      order by o.updated_at desc
      limit 1
    ) opportunity on true
    left join lateral (
      select m.direction, m.sent_at, m.body, m.event_kind, m.event_status
      from crm.messages m
      where m.conversation_id = c.id
      order by m.sent_at desc, m.id desc
      limit 1
    ) latest on true
    left join lateral (
      select m.sent_at
      from crm.messages m
      where m.conversation_id = c.id and m.direction = 'in'
      order by m.sent_at desc, m.id desc
      limit 1
    ) inbound on true
    where c.last_message_at >= p_messages_visible_since
      and (
        nullif(trim(coalesce(p_query, '')), '') is null
        or (
          length(crm.phone_search_digits(p_query)) >= 4
          and crm.phone_search_digits(c.phone_e164)
            like '%' || crm.phone_search_digits(p_query) || '%'
        )
      )
  ),
  categorized as (
    select
      base.*,
      (conversation_kind = 'lead' and excluded_from_pipeline_at is null
        and stage_id in (select id from entry_stages)) as is_qualify,
      (conversation_kind = 'lead' and excluded_from_pipeline_at is not null) as is_archived,
      (conversation_kind = 'group') as is_group,
      (conversation_kind = 'lead' and excluded_from_pipeline_at is null
        and stage_id is not null and stage_id not in (select id from entry_stages)) as is_pipeline
    from base
  ),
  counts as (
    select
      count(*) filter (where is_qualify)::bigint as qualify_count,
      count(*) filter (where is_archived)::bigint as archived_count,
      count(*) filter (where is_group)::bigint as groups_count,
      count(*) filter (where is_pipeline)::bigint as pipeline_count
    from categorized
  ),
  page as (
    select categorized.*, count(*) over ()::bigint as tab_total
    from categorized
    where case p_tab
      when 'archived' then is_archived
      when 'groups' then is_group
      when 'pipeline' then is_pipeline
      else is_qualify
    end
    order by coalesce(last_sent_at, last_message_at, updated_at, created_at) desc,
      created_at desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 100)
  )
  select
    page.conversation_id, page.phone_e164, page.conversation_kind,
    page.group_display_name, page.classification, page.last_message_at,
    page.created_at, page.updated_at, page.last_read_at, page.lead_id,
    page.client_category, page.excluded_from_pipeline_at, page.contact_name,
    page.avatar_url, page.company_name, page.distributor_name, page.stage_id,
    page.weekly_bread_consumption, page.bread_weight_grams,
    page.last_direction, page.last_sent_at, page.last_body_preview,
    page.event_kind, page.event_status, page.last_inbound_sent_at,
    page.tab_total, counts.qualify_count, counts.archived_count,
    counts.groups_count, counts.pipeline_count
  from counts left join page on true;
$$;

revoke all on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text) from public;
grant execute on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text)
  to authenticated, service_role;

commit;
