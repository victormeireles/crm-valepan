-- Inbox: preview da última mensagem fica na conversa. A listagem não lê
-- crm.messages (o RLS dessa tabela estoura o timeout no PostgREST).
begin;

alter table crm.conversations
  add column if not exists last_body_preview text,
  add column if not exists last_inbound_sent_at timestamptz,
  add column if not exists last_event_kind text,
  add column if not exists last_event_status text;

comment on column crm.conversations.last_body_preview is
  'Trecho da última mensagem; mantido pelo trigger de messages para a lista do Inbox.';
comment on column crm.conversations.last_inbound_sent_at is
  'Horário da última mensagem inbound; usado para o ponto de não lida.';

update crm.conversations conversation
set
  last_direction = latest.direction,
  last_message_at = latest.sent_at,
  last_body_preview = latest.body_preview,
  last_event_kind = latest.event_kind,
  last_event_status = latest.event_status,
  last_inbound_sent_at = inbound.sent_at
from (
  select distinct on (message.conversation_id)
    message.conversation_id,
    message.direction,
    message.sent_at,
    left(coalesce(message.body, ''), 500) as body_preview,
    message.event_kind,
    message.event_status
  from crm.messages message
  order by message.conversation_id, message.sent_at desc, message.id desc
) latest
left join lateral (
  select inbound.sent_at
  from crm.messages inbound
  where inbound.conversation_id = latest.conversation_id
    and inbound.direction = 'in'
  order by inbound.sent_at desc, inbound.id desc
  limit 1
) inbound on true
where latest.conversation_id = conversation.id;

create or replace function crm.refresh_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  target_conversation_id uuid;
  previous_conversation_id uuid;
begin
  target_conversation_id := coalesce(new.conversation_id, old.conversation_id);
  previous_conversation_id := case
    when tg_op = 'UPDATE' and old.conversation_id is distinct from new.conversation_id
      then old.conversation_id
    else null
  end;

  perform crm.sync_conversation_last_message(target_conversation_id);
  if previous_conversation_id is not null then
    perform crm.sync_conversation_last_message(previous_conversation_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function crm.sync_conversation_last_message(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  last_at timestamptz;
  last_dir text;
  last_preview text;
  last_kind text;
  last_status text;
  last_in timestamptz;
begin
  select
    latest.sent_at,
    latest.direction,
    left(coalesce(latest.body, ''), 500),
    latest.event_kind,
    latest.event_status
  into last_at, last_dir, last_preview, last_kind, last_status
  from crm.messages latest
  where latest.conversation_id = p_conversation_id
  order by latest.sent_at desc, latest.id desc
  limit 1;

  select inbound.sent_at
  into last_in
  from crm.messages inbound
  where inbound.conversation_id = p_conversation_id
    and inbound.direction = 'in'
  order by inbound.sent_at desc, inbound.id desc
  limit 1;

  update crm.conversations
  set
    last_message_at = last_at,
    last_direction = last_dir,
    last_body_preview = last_preview,
    last_event_kind = last_kind,
    last_event_status = last_status,
    last_inbound_sent_at = last_in
  where id = p_conversation_id;
end;
$$;

drop trigger if exists trg_messages_refresh_conversation_last_message_at on crm.messages;
create trigger trg_messages_refresh_conversation_last_message_at
after insert or update of sent_at, conversation_id, direction, body, event_kind, event_status or delete
on crm.messages
for each row execute function crm.refresh_conversation_last_message_at();

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
      l.distributor_id
    from crm.conversations c
    left join crm.leads l on l.id = c.lead_id
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
  with_stage as (
    select
      visible.*,
      opportunity.stage_id,
      (visible.conversation_kind = 'lead' and visible.excluded_from_pipeline_at is null
        and opportunity.stage_id in (select id from entry_stages)) as is_qualify,
      (visible.conversation_kind = 'lead' and visible.excluded_from_pipeline_at is not null) as is_archived,
      (visible.conversation_kind = 'group') as is_group,
      (visible.conversation_kind = 'lead' and visible.excluded_from_pipeline_at is null
        and opportunity.stage_id is not null
        and opportunity.stage_id not in (select id from entry_stages)) as is_pipeline
    from visible
    left join lateral (
      select o.stage_id
      from crm.opportunities o
      where o.lead_id = visible.lead_id
        and visible.conversation_kind = 'lead'
      order by o.updated_at desc
      limit 1
    ) opportunity on true
  ),
  counts as (
    select
      count(*) filter (where is_qualify)::bigint as qualify_count,
      count(*) filter (where is_archived)::bigint as archived_count,
      count(*) filter (where is_group)::bigint as groups_count,
      count(*) filter (where is_pipeline)::bigint as pipeline_count
    from with_stage
  ),
  page as (
    select
      with_stage.*,
      count(*) over ()::bigint as tab_total
    from with_stage
    where case p_tab
      when 'archived' then is_archived
      when 'groups' then is_group
      when 'pipeline' then is_pipeline
      else is_qualify
    end
    order by coalesce(with_stage.last_message_at, with_stage.updated_at, with_stage.created_at) desc,
      with_stage.created_at desc
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
    distributor.name as distributor_name,
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
    counts.qualify_count,
    counts.archived_count,
    counts.groups_count,
    counts.pipeline_count
  from counts
  left join page on true
  left join crm.contacts contact on contact.id = page.contact_id
  left join crm.companies company on company.id = page.company_id
  left join crm.distributors distributor on distributor.id = page.distributor_id
  order by coalesce(page.last_message_at, page.updated_at, page.created_at) desc nulls last,
    page.created_at desc nulls last;
$$;

revoke all on function crm.sync_conversation_last_message(uuid) from public;
grant execute on function crm.sync_conversation_last_message(uuid) to service_role;
revoke all on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text) from public;
grant execute on function crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text)
  to authenticated, service_role;

commit;
