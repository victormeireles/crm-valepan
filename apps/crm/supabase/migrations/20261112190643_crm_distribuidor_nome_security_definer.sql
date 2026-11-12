-- Evita permission denied em public.usuario_clientes ao avaliar RLS de public.clientes
-- a partir de RPCs security invoker do CRM.

begin;

create or replace function crm.cliente_distribuidor_nome(p_id uuid)
returns text
language sql
stable
security definer
set search_path = crm, public
as $$
  select c.nome_fantasia::text
  from public.clientes c
  where c.id = p_id
    and c.tipo_cliente = 'distribuidor'::tipo_cliente_enum;
$$;

comment on function crm.cliente_distribuidor_nome(uuid) is
  'Nome fantasia do distribuidor em public.clientes, sem expor RLS de pedidos ao CRM.';

revoke all on function crm.cliente_distribuidor_nome(uuid) from public, anon;
grant execute on function crm.cliente_distribuidor_nome(uuid) to authenticated, service_role;

create or replace function crm.inbox_sidebar_snapshot(
  p_messages_visible_since timestamptz,
  p_tab text default 'novos',
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
  novos_count bigint,
  leads_count bigint,
  groups_count bigint,
  clientes_count bigint,
  perdidos_count bigint
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
      l.cliente_distribuidor_id
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
      ) as is_novos
    from classified
  ),
  counts as (
    select
      count(*) filter (where is_novos)::bigint as novos_count,
      count(*) filter (where is_lead)::bigint as leads_count,
      count(*) filter (where is_group)::bigint as groups_count,
      count(*) filter (where is_client)::bigint as clientes_count,
      count(*) filter (where is_lost)::bigint as perdidos_count
    from flagged
  ),
  page as (
    select
      flagged.*,
      count(*) over ()::bigint as tab_total
    from flagged
    where case p_tab
      when 'all' then true
      when 'leads' then is_lead
      when 'pipeline' then is_lead
      when 'groups' then is_group
      when 'clientes' then is_client
      when 'archived' then is_client
      when 'perdidos' then is_lost
      else is_novos
    end
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
    page.tab_total,
    counts.novos_count,
    counts.leads_count,
    counts.groups_count,
    counts.clientes_count,
    counts.perdidos_count
  from counts
  left join page on true
  left join crm.contacts contact on contact.id = page.contact_id
  left join crm.companies company on company.id = page.company_id
  order by coalesce(page.last_message_at, page.updated_at, page.created_at) desc nulls last,
    page.created_at desc nulls last;
$$;

revoke all on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text) from public;
grant execute on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text)
  to authenticated, service_role;

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
language sql
stable
security invoker
set search_path = crm, public
as $$
  with search_parameters as materialized (
    select nullif(trim(coalesce(p_query, '')), '') as query_text
  ),
  candidate_opportunities as materialized (
    select opportunity.*
    from search_parameters parameter
    join crm.opportunities opportunity on parameter.query_text is null

    union all

    select opportunity.*
    from search_parameters parameter
    join crm.pipeline_search_opportunity_ids(parameter.query_text) candidate
      on parameter.query_text is not null
    join crm.opportunities opportunity on opportunity.id = candidate.opportunity_id
  )
  select
    opportunity.id, opportunity.title, opportunity.lead_id, opportunity.stage_id,
    opportunity.lost_reason, opportunity.owner_id, lead.owner_id,
    opportunity.updated_at, opportunity.next_action_at, stage.is_final,
    lead.phone_e164, lead.client_category, lead.cliente_distribuidor_id, lead.network_type,
    contact.full_name, company.name, crm.cliente_distribuidor_nome(lead.cliente_distribuidor_id), company.city, company.state,
    lead.weekly_bread_consumption, lead.bread_weight_grams,
    last_message.conversation_id, last_message.last_direction, last_message.last_sent_at
  from candidate_opportunities opportunity
  inner join crm.leads lead on lead.id = opportunity.lead_id
  inner join crm.pipeline_stages stage on stage.id = opportunity.stage_id
  left join lateral (
    select
      conversation.id as conversation_id,
      conversation.last_direction,
      conversation.last_message_at as last_sent_at
    from crm.conversations conversation
    where conversation.lead_id = lead.id
      and conversation.last_message_at >= p_messages_visible_since
    order by conversation.last_message_at desc, conversation.id desc
    limit 1
  ) last_message on true
  left join crm.contacts contact on contact.id = lead.contact_id
  left join crm.companies company on company.id = lead.company_id
  where lead.excluded_from_pipeline_at is null
    and (
      last_message.conversation_id is not null
      or exists (
        select 1
        from crm.lead_registrations registration
        where registration.lead_id = lead.id
      )
    )
    and (p_stage_id is null or opportunity.stage_id = p_stage_id)
    and (
      p_owner_user_id is null
      or coalesce(opportunity.owner_id, lead.owner_id) = p_owner_user_id
    )
    and (
      p_signal is null
      or (p_signal = 'awaiting_reply' and last_message.last_direction = 'in')
      or (p_signal = 'replied' and last_message.last_direction = 'out')
      or (
        p_signal = 'stale'
        and not stage.is_final
        and opportunity.updated_at <= now() - interval '7 days'
      )
      or (
        p_signal = 'followup_overdue'
        and not stage.is_final
        and opportunity.next_action_at < now()
      )
    )
    and (
      p_region is null
      or (
        p_region = 'sp'
        and substring(crm.phone_search_national_digits(lead.phone_e164) from 1 for 2) = '11'
      )
      or (
        p_region = 'rj'
        and substring(crm.phone_search_national_digits(lead.phone_e164) from 1 for 2) = '21'
      )
    )
    and (
      p_client_category is null
      or (
        p_client_category = 'distribuidor'
        and (
          lower(trim(coalesce(lead.client_category, ''))) = 'distribuidor'
          or lower(trim(coalesce(lead.network_type, ''))) = 'distribuidor'
        )
      )
      or (
        p_client_category <> 'distribuidor'
        and lower(trim(coalesce(lead.client_category, ''))) = p_client_category
      )
    )
    and (
      p_volume is null
      or (p_volume = 'informado' and lead.weekly_bread_consumption is not null)
      or (
        p_volume = 'ate_100'
        and lead.weekly_bread_consumption is not null
        and lead.weekly_bread_consumption <= 100
      )
      or (
        p_volume = 'acima_100'
        and lead.weekly_bread_consumption is not null
        and lead.weekly_bread_consumption > 100
      )
    );
$$;

commit;
