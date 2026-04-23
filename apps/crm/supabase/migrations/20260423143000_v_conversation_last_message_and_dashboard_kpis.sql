-- Última mensagem por conversa (KPI «sem resposta» + lista inbox).
create or replace view crm.v_conversation_last_message as
select distinct on (m.conversation_id)
  m.conversation_id,
  c.lead_id,
  m.direction::text as last_direction,
  m.sent_at as last_sent_at,
  left(coalesce(m.body, ''), 500) as last_body_preview
from crm.messages m
inner join crm.conversations c on c.id = m.conversation_id
order by m.conversation_id, m.sent_at desc, m.id desc;

comment on view crm.v_conversation_last_message is
  'Última mensagem por conversa (sent_at desc); usada em KPIs e pré-visualização da inbox.';

grant select on crm.v_conversation_last_message to authenticated, service_role;

-- Agrega KPIs extra num único round-trip (UTC implícito em now() / timestamptz).
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
        select count(distinct v.lead_id)::bigint
        from crm.v_conversation_last_message v
        where v.last_direction = 'in'
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(*)::bigint
        from crm.leads l
        where l.created_at >= now() - interval '7 days'
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(*)::bigint
        from crm.leads l
        where l.created_at >= now() - interval '14 days'
          and l.created_at < now() - interval '7 days'
      ),
      0::bigint
    ),
    coalesce(
      (
        select count(distinct m.conversation_id)::bigint
        from crm.messages m
        where m.sent_at >= now() - interval '7 days'
      ),
      0::bigint
    );
$$;

comment on function crm.dashboard_kpis_extra() is
  'KPIs do dashboard: leads distintos sem resposta (última msg inbound), novos leads 7d vs 7d anteriores, conversas com mensagem nos últimos 7 dias.';

revoke all on function crm.dashboard_kpis_extra() from public;
grant execute on function crm.dashboard_kpis_extra() to authenticated, service_role;
