-- Contatos que não entram no funil (ex.: funcionário, fornecedor interno).

begin;

alter table crm.leads
  add column if not exists excluded_from_pipeline_at timestamptz,
  add column if not exists excluded_reason text,
  add column if not exists excluded_by uuid references crm.profiles (id) on delete set null;

alter table crm.leads
  drop constraint if exists leads_excluded_reason_allowed;

alter table crm.leads
  add constraint leads_excluded_reason_allowed
  check (
    excluded_reason is null
    or excluded_reason in ('interno', 'fornecedor', 'outro')
  );

comment on column crm.leads.excluded_from_pipeline_at is
  'Quando preenchido, o lead não aparece no funil nem na lista principal do inbox; novas mensagens não recriam oportunidade.';

create index if not exists idx_leads_excluded_from_pipeline
  on crm.leads (excluded_from_pipeline_at)
  where excluded_from_pipeline_at is not null;

-- KPIs: não contar leads arquivados como prospect.
create or replace function crm.dashboard_kpis_extra()
returns table (
  leads_awaiting_reply bigint,
  new_leads_7d bigint,
  new_leads_prev_7d bigint,
  active_conversations_7d bigint
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    coalesce(
      (
        select count(*)::bigint
        from crm.v_lead_last_message v
        inner join crm.leads l on l.id = v.lead_id
        where v.last_direction = 'in'
          and l.excluded_from_pipeline_at is null
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(*)::bigint
        from crm.leads l
        where l.created_at >= now() - interval '7 days'
          and l.excluded_from_pipeline_at is null
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(*)::bigint
        from crm.leads l
        where l.created_at >= now() - interval '14 days'
          and l.created_at < now() - interval '7 days'
          and l.excluded_from_pipeline_at is null
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(distinct m.conversation_id)::bigint
        from crm.messages m
        inner join crm.conversations c on c.id = m.conversation_id
        inner join crm.leads l on l.id = c.lead_id
        where m.sent_at >= now() - interval '7 days'
          and l.excluded_from_pipeline_at is null
      ),
      0::bigint
    );
$$;

commit;
