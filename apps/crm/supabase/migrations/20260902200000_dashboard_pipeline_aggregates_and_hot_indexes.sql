begin;

-- O dashboard precisa somente da quantidade por etapa. Agregar no banco evita
-- transferir todas as oportunidades (e o relacionamento de lead) a cada acesso.
create or replace function crm.dashboard_pipeline_stage_counts()
returns table (
  stage_id uuid,
  opportunity_count bigint
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select o.stage_id, count(*)::bigint
  from crm.opportunities o
  inner join crm.leads l on l.id = o.lead_id
  where l.excluded_from_pipeline_at is null
  group by o.stage_id;
$$;

revoke all on function crm.dashboard_pipeline_stage_counts() from public;
grant execute on function crm.dashboard_pipeline_stage_counts() to authenticated, service_role;

-- Ordenações/filtros dos caminhos mais acessados.
create index if not exists idx_conversations_kind_last_message_at
  on crm.conversations (conversation_kind, last_message_at desc, created_at desc)
  where last_message_at is not null;

create index if not exists idx_messages_conversation_sent_at
  on crm.messages (conversation_id, sent_at desc);

create index if not exists idx_opportunities_lead_updated_at
  on crm.opportunities (lead_id, updated_at desc)
  where lead_id is not null;

create index if not exists idx_opportunities_stage_id
  on crm.opportunities (stage_id);

analyze crm.conversations;
analyze crm.messages;
analyze crm.opportunities;

commit;
