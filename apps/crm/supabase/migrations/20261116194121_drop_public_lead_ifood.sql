-- Remove o cadastro público do evento iFood e as tabelas usadas só por ele.
-- O funil volta a exigir conversa visível (comportamento anterior ao evento).
begin;

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
language sql
stable
security invoker
set search_path = crm, public
as $$
  with search_parameters as materialized (
    select nullif(trim(coalesce(p_query, '')), '') as query_text
  ),
  candidate_opportunities as materialized (
    select opportunity.*
    from search_parameters parameter
    join crm.opportunities opportunity on parameter.query_text is null

    union all

    select opportunity.*
    from search_parameters parameter
    join crm.pipeline_search_opportunity_ids(parameter.query_text) candidate
      on parameter.query_text is not null
    join crm.opportunities opportunity on opportunity.id = candidate.opportunity_id
  )
  select
    opportunity.id, opportunity.title, opportunity.lead_id, opportunity.stage_id,
    opportunity.lost_reason, opportunity.owner_id, lead.owner_id,
    opportunity.updated_at, opportunity.next_action_at, stage.is_final,
    lead.phone_e164, lead.client_category, lead.cliente_distribuidor_id, lead.network_type,
    contact.full_name, company.name, crm.cliente_distribuidor_nome(lead.cliente_distribuidor_id), company.city, company.state,
    lead.weekly_bread_consumption, lead.bread_weight_grams,
    last_message.conversation_id, last_message.last_direction, last_message.last_sent_at
  from candidate_opportunities opportunity
  inner join crm.leads lead on lead.id = opportunity.lead_id
  inner join crm.pipeline_stages stage on stage.id = opportunity.stage_id
  left join lateral (
    select
      conversation.id as conversation_id,
      conversation.last_direction,
      conversation.last_message_at as last_sent_at
    from crm.conversations conversation
    where conversation.lead_id = lead.id
      and conversation.last_message_at >= p_messages_visible_since
    order by conversation.last_message_at desc, conversation.id desc
    limit 1
  ) last_message on true
  left join crm.contacts contact on contact.id = lead.contact_id
  left join crm.companies company on company.id = lead.company_id
  where lead.excluded_from_pipeline_at is null
    and last_message.conversation_id is not null
    and (p_stage_id is null or opportunity.stage_id = p_stage_id)
    and (
      p_owner_user_id is null
      or coalesce(opportunity.owner_id, lead.owner_id) = p_owner_user_id
    )
    and (
      p_signal is null
      or (p_signal = 'awaiting_reply' and last_message.last_direction = 'in')
      or (p_signal = 'replied' and last_message.last_direction = 'out')
      or (
        p_signal = 'stale'
        and not stage.is_final
        and opportunity.updated_at <= now() - interval '7 days'
      )
      or (
        p_signal = 'followup_overdue'
        and not stage.is_final
        and opportunity.next_action_at < now()
      )
    )
    and (
      p_region is null
      or (
        p_region = 'sp'
        and substring(crm.phone_search_national_digits(lead.phone_e164) from 1 for 2) = '11'
      )
      or (
        p_region = 'rj'
        and substring(crm.phone_search_national_digits(lead.phone_e164) from 1 for 2) = '21'
      )
    )
    and (
      p_client_category is null
      or (
        p_client_category = 'distribuidor'
        and (
          lower(trim(coalesce(lead.client_category, ''))) = 'distribuidor'
          or lower(trim(coalesce(lead.network_type, ''))) = 'distribuidor'
        )
      )
      or (
        p_client_category <> 'distribuidor'
        and lower(trim(coalesce(lead.client_category, ''))) = p_client_category
      )
    )
    and (
      p_volume is null
      or (p_volume = 'informado' and lead.weekly_bread_consumption is not null)
      or (
        p_volume = 'ate_100'
        and lead.weekly_bread_consumption is not null
        and lead.weekly_bread_consumption <= 100
      )
      or (
        p_volume = 'acima_100'
        and lead.weekly_bread_consumption is not null
        and lead.weekly_bread_consumption > 100
      )
    );
$$;

drop function if exists crm.register_public_lead(text, text, text, text, text, text, text, text);
drop function if exists crm.register_public_lead(text, text, text, text, text, text, text);
drop function if exists crm.pipeline_lead_has_registration(uuid);
drop table if exists crm.lead_registration_rate_limits;
drop table if exists crm.lead_registrations;
drop function if exists crm.is_valid_cpf_cnpj(text);

commit;
