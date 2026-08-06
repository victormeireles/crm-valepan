begin;

create table if not exists crm.document_insights (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references crm.messages (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'not_configured')),
  extracted_text text,
  summary text,
  document_type text,
  language text,
  keywords text[] not null default '{}',
  model text,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(summary, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(document_type, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(extracted_text, '')), 'C')
  ) stored
);

create index if not exists idx_document_insights_search
  on crm.document_insights using gin (search_vector);
create index if not exists idx_document_insights_status
  on crm.document_insights (status, updated_at desc);

alter table crm.document_insights enable row level security;

drop policy if exists document_insights_select on crm.document_insights;
create policy document_insights_select on crm.document_insights
  for select to authenticated using (
    exists (
      select 1
      from crm.messages m
      where m.id = document_insights.message_id
    )
  );

grant select on crm.document_insights to authenticated;
grant all on crm.document_insights to service_role;

create or replace function crm.search_document_insights(
  p_query text,
  p_conversation_id uuid default null
)
returns table (
  message_id uuid,
  file_name text,
  summary text,
  document_type text,
  processed_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    di.message_id,
    m.media_file_name as file_name,
    di.summary,
    di.document_type,
    di.processed_at,
    ts_rank(di.search_vector, websearch_to_tsquery('portuguese', p_query)) as rank
  from crm.document_insights di
  join crm.messages m on m.id = di.message_id
  where di.status = 'completed'
    and nullif(trim(p_query), '') is not null
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and di.search_vector @@ websearch_to_tsquery('portuguese', p_query)
  order by rank desc, di.processed_at desc nulls last
  limit 30;
$$;

grant execute on function crm.search_document_insights(text, uuid) to authenticated;

commit;
