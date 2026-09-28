-- Separa cartões, contagens e KPIs do Funil para que cada parte possa ser
-- carregada e atualizada independentemente.

begin;

drop function if exists crm.pipeline_stage_counts(timestamptz, uuid, text, text, text, text, uuid, text);
drop function if exists crm.pipeline_owner_counts(timestamptz, text, text, text, text, uuid, text);
drop function if exists crm.pipeline_owner_summary(timestamptz, uuid, text, text, text, uuid, text);

create or replace function crm.pipeline_stage_counts(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null,
  p_lost_reason text default null
)
returns table (stage_id uuid, card_count bigint, volume_kg bigint)
language sql stable security invoker set search_path = crm, public
as $$
  select
    card.stage_id,
    count(*)::bigint,
    coalesce(sum(card.weekly_bread_consumption), 0)::bigint
  from crm.pipeline_filtered_cards(
    p_messages_visible_since, p_owner_user_id, p_signal, p_region,
    p_client_category, p_query, p_stage_id, p_volume
  ) card
  where p_lost_reason is null
    or lower(trim(coalesce(card.lost_reason, ''))) = lower(trim(p_lost_reason))
  group by card.stage_id;
$$;

create or replace function crm.pipeline_owner_counts(
  p_messages_visible_since timestamptz,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null,
  p_lost_reason text default null
)
returns table (owner_id uuid, card_count bigint)
language sql stable security invoker set search_path = crm, public
as $$
  select
    coalesce(card.opportunity_owner_id, card.lead_owner_id),
    count(*)::bigint
  from crm.pipeline_filtered_cards(
    p_messages_visible_since, null, p_signal, p_region,
    p_client_category, p_query, p_stage_id, p_volume
  ) card
  where coalesce(card.opportunity_owner_id, card.lead_owner_id) is not null
    and (
      p_lost_reason is null
      or lower(trim(coalesce(card.lost_reason, ''))) = lower(trim(p_lost_reason))
    )
  group by coalesce(card.opportunity_owner_id, card.lead_owner_id);
$$;

create or replace function crm.pipeline_owner_summary(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null,
  p_lost_reason text default null
)
returns table (
  open_count bigint,
  awaiting_reply_count bigint,
  stale_count bigint,
  overdue_count bigint
)
language sql stable security invoker set search_path = crm, public
as $$
  select
    count(*) filter (where not card.stage_is_final)::bigint,
    count(*) filter (
      where not card.stage_is_final and card.last_direction = 'in'
    )::bigint,
    count(*) filter (
      where not card.stage_is_final
        and card.opportunity_updated_at <= now() - interval '7 days'
    )::bigint,
    count(*) filter (
      where not card.stage_is_final
        and card.next_action_at is not null
        and card.next_action_at < now()
    )::bigint
  from crm.pipeline_filtered_cards(
    p_messages_visible_since, p_owner_user_id, p_signal, p_region,
    p_client_category, p_query, p_stage_id, p_volume
  ) card
  where p_lost_reason is null
    or lower(trim(coalesce(card.lost_reason, ''))) = lower(trim(p_lost_reason));
$$;

create or replace function crm.pipeline_counts_snapshot(
  p_messages_visible_since timestamptz,
  p_owner_user_id uuid default null,
  p_signal text default null,
  p_region text default null,
  p_client_category text default null,
  p_query text default null,
  p_stage_id uuid default null,
  p_volume text default null,
  p_lost_reason text default null
)
returns jsonb
language sql stable security invoker set search_path = crm, public
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
  visible_cards as materialized (
    select *
    from all_cards card
    where p_owner_user_id is null
      or coalesce(card.opportunity_owner_id, card.lead_owner_id) = p_owner_user_id
  )
  select jsonb_build_object(
    'visible_stage_counts', coalesce((
      select jsonb_agg(to_jsonb(counts) order by counts.stage_id)
      from (
        select stage_id, count(*)::bigint as card_count,
          coalesce(sum(weekly_bread_consumption), 0)::bigint as volume_kg
        from visible_cards
        group by stage_id
      ) counts
    ), '[]'::jsonb),
    'all_stage_counts', coalesce((
      select jsonb_agg(to_jsonb(counts) order by counts.stage_id)
      from (
        select stage_id, count(*)::bigint as card_count,
          coalesce(sum(weekly_bread_consumption), 0)::bigint as volume_kg
        from all_cards
        group by stage_id
      ) counts
    ), '[]'::jsonb),
    'owner_counts', coalesce((
      select jsonb_agg(to_jsonb(counts) order by counts.owner_id)
      from (
        select
          coalesce(opportunity_owner_id, lead_owner_id) as owner_id,
          count(*)::bigint as card_count
        from all_cards
        where coalesce(opportunity_owner_id, lead_owner_id) is not null
        group by coalesce(opportunity_owner_id, lead_owner_id)
      ) counts
    ), '[]'::jsonb)
  );
$$;

revoke all on function crm.pipeline_stage_counts(timestamptz, uuid, text, text, text, text, uuid, text, text) from public;
revoke all on function crm.pipeline_owner_counts(timestamptz, text, text, text, text, uuid, text, text) from public;
revoke all on function crm.pipeline_owner_summary(timestamptz, uuid, text, text, text, text, uuid, text, text) from public;
revoke all on function crm.pipeline_counts_snapshot(timestamptz, uuid, text, text, text, text, uuid, text, text) from public;

grant execute on function crm.pipeline_stage_counts(timestamptz, uuid, text, text, text, text, uuid, text, text) to authenticated, service_role;
grant execute on function crm.pipeline_owner_counts(timestamptz, text, text, text, text, uuid, text, text) to authenticated, service_role;
grant execute on function crm.pipeline_owner_summary(timestamptz, uuid, text, text, text, text, uuid, text, text) to authenticated, service_role;
grant execute on function crm.pipeline_counts_snapshot(timestamptz, uuid, text, text, text, text, uuid, text, text) to authenticated, service_role;

commit;
