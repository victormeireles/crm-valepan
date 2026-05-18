-- Última mensagem por lead (todas as conversas), para sinais do funil e KPIs.

begin;

create or replace view crm.v_lead_last_message as
select distinct on (c.lead_id)
  c.lead_id,
  m.direction::text as last_direction,
  m.sent_at as last_sent_at,
  left(coalesce(m.body, ''), 500) as last_body_preview
from crm.messages m
inner join crm.conversations c on c.id = m.conversation_id
where c.lead_id is not null
order by c.lead_id, m.sent_at desc, m.id desc;

comment on view crm.v_lead_last_message is
  'Última mensagem do lead em qualquer conversa; usada no funil (status automático).';

grant select on crm.v_lead_last_message to authenticated, service_role;

-- KPI «sem resposta»: um lead conta uma vez, pela mensagem mais recente (não por conversa).
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

commit;
