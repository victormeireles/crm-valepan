begin;

-- Payload consolidado do Funil. A página fazia a leitura das oportunidades em
-- lotes e depois consultava a última mensagem em vários lotes adicionais.
-- Manter esse trabalho no banco elimina viagens de rede e permite que o
-- planejador escolha a estratégia de join mais barata.
create or replace function crm.pipeline_cards(p_messages_visible_since timestamptz)
returns table (
  opportunity_id uuid,
  title text,
  lead_id uuid,
  stage_id uuid,
  lost_reason text,
  opportunity_owner_id uuid,
  lead_owner_id uuid,
  opportunity_updated_at timestamptz,
  next_action_at timestamptz,
  stage_is_final boolean,
  phone_e164 text,
  client_category text,
  distributor_id uuid,
  network_type text,
  contact_name text,
  company_name text,
  distributor_name text,
  company_city text,
  company_state text,
  weekly_bread_consumption integer,
  bread_weight_grams integer,
  conversation_id uuid,
  last_direction text,
  last_sent_at timestamptz
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    o.id,
    o.title,
    o.lead_id,
    o.stage_id,
    o.lost_reason,
    o.owner_id,
    l.owner_id,
    o.updated_at,
    o.next_action_at,
    ps.is_final,
    l.phone_e164,
    l.client_category,
    l.distributor_id,
    l.network_type,
    c.full_name,
    company.name,
    distributor.name,
    company.city,
    company.state,
    l.weekly_bread_consumption,
    l.bread_weight_grams,
    last_message.conversation_id,
    last_message.last_direction,
    last_message.last_sent_at
  from crm.opportunities o
  inner join crm.leads l on l.id = o.lead_id
  inner join crm.pipeline_stages ps on ps.id = o.stage_id
  inner join lateral (
    select message.conversation_id, message.last_direction, message.last_sent_at
    from crm.v_conversation_last_message message
    where message.lead_id = l.id
      and message.last_sent_at >= p_messages_visible_since
    order by message.last_sent_at desc
    limit 1
  ) last_message on true
  left join crm.contacts c on c.id = l.contact_id
  left join crm.companies company on company.id = l.company_id
  left join crm.distributors distributor on distributor.id = l.distributor_id
  where l.excluded_from_pipeline_at is null
  order by o.updated_at desc, o.id desc;
$$;

comment on function crm.pipeline_cards(timestamptz) is
  'Cartões visíveis do Funil com identidade, etapa e direção da última mensagem em uma única consulta.';

revoke all on function crm.pipeline_cards(timestamptz) from public;
grant execute on function crm.pipeline_cards(timestamptz) to authenticated, service_role;

-- Ajuda o join da visão de última mensagem a localizar as conversas do lead.
create index if not exists idx_conversations_lead_id
  on crm.conversations (lead_id)
  where lead_id is not null;

analyze crm.conversations;

commit;
