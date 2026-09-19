-- Funil: última direção na conversa (sem reler messages) e uma RPC só no load.
begin;

alter table crm.conversations
  add column if not exists last_message_at timestamptz,
  add column if not exists last_direction text;

alter table crm.conversations
  drop constraint if exists conversations_last_direction_check;

alter table crm.conversations
  add constraint conversations_last_direction_check
  check (last_direction is null or last_direction in ('in', 'out'));

comment on column crm.conversations.last_direction is
  'Direção da última mensagem da conversa; mantida pelo trigger de messages.';

update crm.conversations conversation
set
  last_direction = latest.direction,
  last_message_at = latest.sent_at
from (
  select distinct on (message.conversation_id)
    message.conversation_id,
    message.direction,
    message.sent_at
  from crm.messages message
  order by message.conversation_id, message.sent_at desc, message.id desc
) latest
where latest.conversation_id = conversation.id
  and (
    conversation.last_direction is distinct from latest.direction
    or conversation.last_message_at is distinct from latest.sent_at
  );

create index if not exists idx_conversations_lead_last_message
  on crm.conversations (lead_id, last_message_at desc nulls last)
  where lead_id is not null;

create or replace function crm.refresh_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  target_conversation_id uuid;
  previous_conversation_id uuid;
  last_at timestamptz;
  last_dir text;
begin
  target_conversation_id := coalesce(new.conversation_id, old.conversation_id);
  previous_conversation_id := case
    when tg_op = 'UPDATE' and old.conversation_id is distinct from new.conversation_id
      then old.conversation_id
    else null
  end;

  select latest.sent_at, latest.direction
  into last_at, last_dir
  from crm.messages latest
  where latest.conversation_id = target_conversation_id
  order by latest.sent_at desc, latest.id desc
  limit 1;

  update crm.conversations
  set last_message_at = last_at, last_direction = last_dir
  where id = target_conversation_id;

  if previous_conversation_id is not null then
    select latest.sent_at, latest.direction
    into last_at, last_dir
    from crm.messages latest
    where latest.conversation_id = previous_conversation_id
    order by latest.sent_at desc, latest.id desc
    limit 1;

    update crm.conversations
    set last_message_at = last_at, last_direction = last_dir
    where id = previous_conversation_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_messages_refresh_conversation_last_message_at on crm.messages;
create trigger trg_messages_refresh_conversation_last_message_at
after insert or update of sent_at, conversation_id, direction or delete on crm.messages
for each row execute function crm.refresh_conversation_last_message_at();

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
    select
      conversation.id as conversation_id,
      conversation.last_direction,
      conversation.last_message_at as last_sent_at
    from crm.conversations conversation
    where conversation.lead_id = l.id
      and conversation.last_message_at >= p_messages_visible_since
    order by conversation.last_message_at desc, conversation.id desc
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
  p_volume text default null
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
    )
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

revoke all on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text) from public;
grant execute on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text) to authenticated, service_role;

comment on function crm.pipeline_board_snapshot(timestamptz, uuid, text, text, text, text, uuid, integer, integer, text)
  is 'Uma leitura do funil: cartões da página, totais por etapa/vendedor e KPIs.';

commit;
