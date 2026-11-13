-- Expõe owner_id / owner_name no snapshot da sidebar (chip de responsável).

begin;

drop function if exists crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text, boolean);

create function crm.inbox_sidebar_snapshot(
  p_messages_visible_since timestamptz,
  p_tab text default 'leads',
  p_offset integer default 0,
  p_limit integer default 40,
  p_query text default null,
  p_unread boolean default false
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
  owner_id uuid,
  owner_name text,
  tab_total bigint,
  novos_count bigint,
  leads_count bigint,
  leads_unread_count bigint,
  groups_count bigint,
  groups_unread_count bigint,
  clientes_count bigint,
  clientes_unread_count bigint,
  perdidos_count bigint,
  perdidos_unread_count bigint
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with parameters as (
    select
      nullif(trim(coalesce(p_query, '')), '') as query_text,
      crm.phone_search_digits(p_query) as query_digits
  ),
  stage_keys as (
    select
      stage.id,
      case upper(trim(stage.name))
        when 'ENTRADA' then 'LEADS'
        when 'CHATBOT' then 'LEADS'
        when 'LEAD NOVO' then 'LEADS'
        when 'SEM RETORNO' then 'QUALIFICAÇÃO'
        when 'AMOSTRA' then 'NEGOCIAÇÃO'
        when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'NEGOCIAÇÃO'
        when 'JÁ É CLIENTE' then 'CONVERTIDO'
        when 'CLIENTE' then 'CONVERTIDO'
        when 'NÃO INAUGUROU' then 'PERDIDO'
        when 'SEM PEDIDO MÍNIMO' then 'PERDIDO'
        when 'SEM INTERESSE' then 'PERDIDO'
        when 'NÃO ATENDEMOS A REGIÃO' then 'PERDIDO'
        when 'NÃO TEMOS O PÃO' then 'PERDIDO'
        when 'NÃO RESPONDE' then 'PERDIDO'
        else upper(trim(stage.name))
      end as stage_key
    from crm.pipeline_stages stage
  ),
  visible as (
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
      c.last_direction,
      c.last_body_preview,
      c.last_event_kind,
      c.last_event_status,
      c.last_inbound_sent_at,
      l.id as lead_id,
      l.client_category,
      l.excluded_from_pipeline_at,
      l.weekly_bread_consumption,
      l.bread_weight_grams,
      l.contact_id,
      l.company_id,
      l.cliente_distribuidor_id,
      l.owner_id
    from crm.conversations c
    left join crm.leads l on l.id = c.lead_id
    cross join parameters parameter
    where c.last_message_at >= p_messages_visible_since
      and (
        parameter.query_text is null
        or (
          length(parameter.query_digits) >= 4
          and crm.phone_search_digits(c.phone_e164)
            like '%' || parameter.query_digits || '%'
        )
        or c.phone_e164 ilike '%' || parameter.query_text || '%'
        or c.group_display_name ilike '%' || parameter.query_text || '%'
        or exists (
          select 1
          from crm.contacts contact
          where contact.id = l.contact_id
            and contact.full_name ilike '%' || parameter.query_text || '%'
        )
        or exists (
          select 1
          from crm.companies company
          where company.id = l.company_id
            and company.name ilike '%' || parameter.query_text || '%'
        )
      )
  ),
  with_stage as (
    select
      visible.*,
      opportunity.stage_id,
      stage_keys.stage_key
    from visible
    left join lateral (
      select o.stage_id
      from crm.opportunities o
      where o.lead_id = visible.lead_id
        and visible.conversation_kind = 'lead'
      order by o.updated_at desc
      limit 1
    ) opportunity on true
    left join stage_keys on stage_keys.id = opportunity.stage_id
  ),
  classified as (
    select
      with_stage.*,
      (with_stage.conversation_kind = 'group') as is_group,
      (
        with_stage.conversation_kind = 'lead'
        and (
          with_stage.excluded_from_pipeline_at is not null
          or with_stage.stage_key = 'CONVERTIDO'
          or (
            with_stage.stage_key is null
            and upper(trim(coalesce(with_stage.classification, ''))) in ('CLIENTE', 'JÁ É CLIENTE')
          )
        )
      ) as is_client
    from with_stage
  ),
  flagged as (
    select
      classified.*,
      (
        classified.conversation_kind = 'lead'
        and not classified.is_client
        and classified.stage_key = 'PERDIDO'
      ) as is_lost,
      (
        classified.conversation_kind = 'lead'
        and not classified.is_client
        and classified.stage_key in ('QUALIFICAÇÃO', 'NEGOCIAÇÃO')
      ) as is_lead,
      (
        classified.conversation_kind = 'lead'
        and not classified.is_client
        and classified.stage_key = 'LEADS'
      ) as is_novos,
      (
        classified.last_inbound_sent_at is not null
        and (
          classified.last_read_at is null
          or classified.last_inbound_sent_at > classified.last_read_at
        )
      ) as is_unread
    from classified
  ),
  counts as (
    select
      count(*) filter (where is_novos)::bigint as novos_count,
      count(*) filter (where is_novos or is_lead)::bigint as leads_count,
      count(*) filter (where (is_novos or is_lead) and is_unread)::bigint as leads_unread_count,
      count(*) filter (where is_group)::bigint as groups_count,
      count(*) filter (where is_group and is_unread)::bigint as groups_unread_count,
      count(*) filter (where is_client)::bigint as clientes_count,
      count(*) filter (where is_client and is_unread)::bigint as clientes_unread_count,
      count(*) filter (where is_lost)::bigint as perdidos_count,
      count(*) filter (where is_lost and is_unread)::bigint as perdidos_unread_count
    from flagged
  ),
  page as (
    select
      flagged.*,
      count(*) over ()::bigint as tab_total
    from flagged
    where case p_tab
      when 'all' then true
      when 'leads' then (is_novos or is_lead)
      when 'novos' then (is_novos or is_lead)
      when 'pipeline' then (is_novos or is_lead)
      when 'groups' then is_group
      when 'clientes' then is_client
      when 'archived' then is_client
      when 'perdidos' then is_lost
      else (is_novos or is_lead)
    end
      and (not coalesce(p_unread, false) or is_unread)
    order by coalesce(flagged.last_message_at, flagged.updated_at, flagged.created_at) desc,
      flagged.created_at desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 100)
  )
  select
    page.conversation_id,
    page.phone_e164,
    page.conversation_kind,
    page.group_display_name,
    page.classification,
    page.last_message_at,
    page.created_at,
    page.updated_at,
    page.last_read_at,
    page.lead_id,
    page.client_category,
    page.excluded_from_pipeline_at,
    contact.full_name as contact_name,
    contact.avatar_url,
    company.name as company_name,
    crm.cliente_distribuidor_nome(page.cliente_distribuidor_id) as distributor_name,
    page.stage_id,
    page.weekly_bread_consumption,
    page.bread_weight_grams,
    page.last_direction,
    page.last_message_at as last_sent_at,
    page.last_body_preview,
    page.last_event_kind as event_kind,
    page.last_event_status as event_status,
    page.last_inbound_sent_at,
    page.owner_id,
    owner_profile.full_name as owner_name,
    page.tab_total,
    counts.novos_count,
    counts.leads_count,
    counts.leads_unread_count,
    counts.groups_count,
    counts.groups_unread_count,
    counts.clientes_count,
    counts.clientes_unread_count,
    counts.perdidos_count,
    counts.perdidos_unread_count
  from counts
  left join page on true
  left join crm.contacts contact on contact.id = page.contact_id
  left join crm.companies company on company.id = page.company_id
  left join crm.profiles owner_profile on owner_profile.id = page.owner_id
  order by coalesce(page.last_message_at, page.updated_at, page.created_at) desc nulls last,
    page.created_at desc nulls last;
$$;

revoke all on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text, boolean)
  from public;
grant execute on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text, boolean)
  to authenticated, service_role;

commit;
