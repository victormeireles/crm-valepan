begin;

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
  select
    o.id, o.title, o.lead_id, o.stage_id, o.lost_reason, o.owner_id, l.owner_id,
    o.updated_at, o.next_action_at, ps.is_final, l.phone_e164, l.client_category,
    l.distributor_id, l.network_type, contact.full_name, company.name, distributor.name,
    company.city, company.state, l.weekly_bread_consumption, l.bread_weight_grams,
    last_message.conversation_id, last_message.last_direction, last_message.last_sent_at
  from crm.opportunities o
  inner join crm.leads l on l.id = o.lead_id
  inner join crm.pipeline_stages ps on ps.id = o.stage_id
  inner join lateral (
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
      or (p_region = 'sp' and substring(case
        when regexp_replace(l.phone_e164, '\D', '', 'g') like '55%'
          then substring(regexp_replace(l.phone_e164, '\D', '', 'g') from 3)
        else regexp_replace(l.phone_e164, '\D', '', 'g')
      end from 1 for 2) = '11')
      or (p_region = 'rj' and substring(case
        when regexp_replace(l.phone_e164, '\D', '', 'g') like '55%'
          then substring(regexp_replace(l.phone_e164, '\D', '', 'g') from 3)
        else regexp_replace(l.phone_e164, '\D', '', 'g')
      end from 1 for 2) = '21')
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
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or concat_ws(' ', contact.full_name, company.name, o.title) ilike '%' || trim(p_query) || '%'
      or (
        length(regexp_replace(p_query, '\D', '', 'g')) >= 4
        and concat_ws(' ', l.phone_e164, o.title) ~ regexp_replace(p_query, '\D', '', 'g')
      )
    )
    and (
      p_volume is null
      or (p_volume = 'informado' and l.weekly_bread_consumption is not null)
      or (p_volume = 'ate_100' and l.weekly_bread_consumption is not null
        and l.weekly_bread_consumption <= 100)
      or (p_volume = 'acima_100' and l.weekly_bread_consumption is not null
        and l.weekly_bread_consumption > 100)
    );
$$;

create or replace function crm.pipeline_stage_counts(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null
)
returns table (stage_id uuid, card_count bigint, volume_kg bigint)
language sql stable security invoker set search_path = crm, public
as $$
  select card.stage_id, count(*)::bigint,
    coalesce(sum(card.weekly_bread_consumption), 0)::bigint
  from crm.pipeline_filtered_cards(
    p_messages_visible_since, p_owner_user_id, p_signal, p_region,
    p_client_category, p_query, p_stage_id, p_volume
  ) card
  group by card.stage_id;
$$;

comment on function crm.pipeline_stage_counts(timestamptz, uuid, text, text, text, text, uuid, text)
  is 'Contagens do funil; volume_kg é um nome legado e contém a quantidade de pães por semana.';

commit;
