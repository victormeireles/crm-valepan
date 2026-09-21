-- Filtro de subclassificação (lost_reason) no snapshot e na paginação do funil.

begin;

drop function if exists crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text);
drop function if exists crm.pipeline_cards_page(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text);
drop function if exists crm.pipeline_cards_page(timestamptz, uuid, text, text, text, text, uuid, integer, integer);

create or replace function crm.pipeline_board_snapshot(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 10,
  p_volume text default null,
  p_lost_reason text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
  with all_cards as materialized (
    select *
    from crm.pipeline_filtered_cards(
      p_messages_visible_since, null, p_signal, p_region,
      p_client_category, p_query, p_stage_id, p_volume
    ) card
    where p_lost_reason is null
      or lower(trim(coalesce(card.lost_reason, ''))) = lower(trim(p_lost_reason))
  ),
  visible as materialized (
    select *
    from all_cards
    where p_owner_user_id is null
      or coalesce(opportunity_owner_id, lead_owner_id) = p_owner_user_id
  ),
  ranked as (
    select
      card.*,
      row_number() over (
        partition by card.stage_id
        order by card.opportunity_updated_at desc, card.opportunity_id desc
      ) as stage_row_number
    from visible card
  )
  select jsonb_build_object(
    'cards', coalesce((
      select jsonb_agg(to_jsonb(card) - 'stage_row_number' order by card.stage_id, card.stage_row_number)
      from ranked card
      where card.stage_row_number > greatest(p_offset, 0)
        and card.stage_row_number <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)
    ), '[]'::jsonb),
    'visible_stage_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage_id', counts.stage_id,
        'card_count', counts.card_count,
        'volume_kg', counts.volume_kg
      ) order by counts.stage_id)
      from (
        select
          visible.stage_id,
          count(*)::bigint as card_count,
          coalesce(sum(visible.weekly_bread_consumption), 0)::bigint as volume_kg
        from visible
        group by visible.stage_id
      ) counts
    ), '[]'::jsonb),
    'all_stage_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage_id', counts.stage_id,
        'card_count', counts.card_count,
        'volume_kg', counts.volume_kg
      ) order by counts.stage_id)
      from (
        select
          all_cards.stage_id,
          count(*)::bigint as card_count,
          coalesce(sum(all_cards.weekly_bread_consumption), 0)::bigint as volume_kg
        from all_cards
        group by all_cards.stage_id
      ) counts
    ), '[]'::jsonb),
    'owner_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'owner_id', counts.owner_id,
        'card_count', counts.card_count
      ) order by counts.owner_id)
      from (
        select
          coalesce(all_cards.opportunity_owner_id, all_cards.lead_owner_id) as owner_id,
          count(*)::bigint as card_count
        from all_cards
        where coalesce(all_cards.opportunity_owner_id, all_cards.lead_owner_id) is not null
        group by 1
      ) counts
    ), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'open_count', count(*) filter (where not visible.stage_is_final),
        'awaiting_reply_count', count(*) filter (where not visible.stage_is_final and visible.last_direction = 'in'),
        'stale_count', count(*) filter (
          where not visible.stage_is_final
            and visible.opportunity_updated_at <= now() - interval '7 days'
        ),
        'overdue_count', count(*) filter (
          where not visible.stage_is_final
            and visible.next_action_at is not null
            and visible.next_action_at < now()
        )
      )
      from visible
    )
  );
$$;

create or replace function crm.pipeline_cards_page(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 20,
  p_volume text default null,
  p_lost_reason text default null
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
  with ranked as (
    select card.*, row_number() over (
      partition by card.stage_id
      order by card.opportunity_updated_at desc, card.opportunity_id desc
    ) as stage_row_number
    from crm.pipeline_filtered_cards(
      p_messages_visible_since, p_owner_user_id, p_signal, p_region,
      p_client_category, p_query, p_stage_id, p_volume
    ) card
    where p_lost_reason is null
      or lower(trim(coalesce(card.lost_reason, ''))) = lower(trim(p_lost_reason))
  )
  select
    opportunity_id, title, lead_id, stage_id, lost_reason, opportunity_owner_id,
    lead_owner_id, opportunity_updated_at, next_action_at, stage_is_final,
    phone_e164, client_category, distributor_id, network_type, contact_name,
    company_name, distributor_name, company_city, company_state,
    weekly_bread_consumption, bread_weight_grams, conversation_id,
    last_direction, last_sent_at
  from ranked
  where stage_row_number > greatest(p_offset, 0)
    and stage_row_number <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)
  order by stage_id, stage_row_number;
$$;

revoke all on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text, text) from public;
grant execute on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text, text) to authenticated, service_role;

revoke all on function crm.pipeline_cards_page(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text, text) from public;
grant execute on function crm.pipeline_cards_page(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text, text) to authenticated, service_role;

comment on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text, text)
  is 'Uma leitura do funil: cartões da página, totais por etapa/vendedor e KPIs, com filtro opcional de motivo.';

commit;
