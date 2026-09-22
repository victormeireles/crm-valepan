-- Fila de sugestões de avanço no funil (humano confirma; o job nunca aplica sozinho).

begin;

create table crm.pipeline_advance_suggestions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm.leads (id) on delete cascade,
  conversation_id uuid not null references crm.conversations (id) on delete cascade,
  opportunity_id uuid not null references crm.opportunities (id) on delete cascade,
  from_stage_id uuid not null references crm.pipeline_stages (id),
  to_stage_id uuid not null references crm.pipeline_stages (id),
  from_classification text,
  to_classification text not null,
  confidence numeric not null,
  rationale text not null default '',
  evidence_quote text not null default '',
  status text not null default 'pending',
  fingerprint text not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references crm.profiles (id) on delete set null,
  constraint pipeline_advance_suggestions_status_allowed
    check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  constraint pipeline_advance_suggestions_confidence_range
    check (confidence >= 0 and confidence <= 1)
);

create unique index pipeline_advance_suggestions_pending_conversation
  on crm.pipeline_advance_suggestions (conversation_id)
  where status = 'pending';

create index pipeline_advance_suggestions_status_created
  on crm.pipeline_advance_suggestions (status, created_at desc);

create index pipeline_advance_suggestions_lead
  on crm.pipeline_advance_suggestions (lead_id);

comment on table crm.pipeline_advance_suggestions is
  'Sugestões de avanço de etapa/classificação geradas por IA; só entram no funil após Aceitar.';

create or replace function crm.pipeline_advance_recent_messages(
  p_conversation_ids uuid[],
  p_limit int
)
returns table (
  id uuid,
  conversation_id uuid,
  direction text,
  body text,
  media_kind text,
  event_kind text,
  sent_at timestamptz
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    x.id,
    x.conversation_id,
    x.direction,
    x.body,
    x.media_kind,
    x.event_kind,
    x.sent_at
  from (
    select
      m.id,
      m.conversation_id,
      m.direction,
      m.body,
      m.media_kind,
      m.event_kind,
      m.sent_at,
      row_number() over (
        partition by m.conversation_id
        order by m.sent_at desc, m.id desc
      ) as rn
    from crm.messages m
    where m.conversation_id = any (p_conversation_ids)
      and m.deleted_at is null
  ) x
  where x.rn <= greatest(1, least(coalesce(p_limit, 40), 80))
  order by x.conversation_id, x.sent_at asc, x.id asc;
$$;

revoke all on function crm.pipeline_advance_recent_messages(uuid[], int) from public;
grant execute on function crm.pipeline_advance_recent_messages(uuid[], int) to service_role;

alter table crm.pipeline_advance_suggestions enable row level security;

create policy pipeline_advance_suggestions_select on crm.pipeline_advance_suggestions
  for select to authenticated
  using (crm.can_view_flavia_sales_lead(lead_id));

create policy pipeline_advance_suggestions_update on crm.pipeline_advance_suggestions
  for update to authenticated
  using (crm.can_view_flavia_sales_lead(lead_id))
  with check (crm.can_view_flavia_sales_lead(lead_id));

grant select, update on table crm.pipeline_advance_suggestions to authenticated;
grant all on table crm.pipeline_advance_suggestions to service_role;

commit;
