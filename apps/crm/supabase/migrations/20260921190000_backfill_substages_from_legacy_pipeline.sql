-- Recupera subetapas a partir da classificação antiga do funil.
-- conversations.classification está quase vazio; o histórico útil está em
-- activity_logs (stage_changed nas etapas antigas) e, em último caso, amostras.

begin;

with mapped as (
  select
    al.entity_id as opportunity_id,
    al.created_at,
    case upper(trim(al.payload->>'stage_name'))
      when 'CHATBOT' then 'Chatbot'
      when 'SEM RETORNO' then 'Sem retorno'
      when 'AMOSTRA' then 'Pediu amostra'
      when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
      when 'NÃO INAUGUROU' then 'Não inaugurou'
      when 'SEM PEDIDO MÍNIMO' then 'Sem pedido mínimo'
      when 'SEM INTERESSE' then 'Sem interesse'
      when 'NÃO ATENDEMOS A REGIÃO' then 'Não atendemos a região'
      when 'NÃO TEMOS O PÃO' then 'Não temos o pão'
      when 'NÃO RESPONDE' then 'Não responde'
    end as inferred_substage,
    case upper(trim(al.payload->>'stage_name'))
      when 'CHATBOT' then 'LEADS'
      when 'SEM RETORNO' then 'QUALIFICAÇÃO'
      when 'AMOSTRA' then 'NEGOCIAÇÃO'
      when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'NEGOCIAÇÃO'
      when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'NEGOCIAÇÃO'
      when 'NÃO INAUGUROU' then 'PERDIDO'
      when 'SEM PEDIDO MÍNIMO' then 'PERDIDO'
      when 'SEM INTERESSE' then 'PERDIDO'
      when 'NÃO ATENDEMOS A REGIÃO' then 'PERDIDO'
      when 'NÃO TEMOS O PÃO' then 'PERDIDO'
      when 'NÃO RESPONDE' then 'PERDIDO'
    end as inferred_stage
  from crm.activity_logs al
  where al.action = 'stage_changed'
    and al.entity_type = 'opportunity'
),
last_match as (
  select distinct on (mapped.opportunity_id)
    mapped.opportunity_id,
    mapped.inferred_substage
  from mapped
  join crm.opportunities opportunity on opportunity.id = mapped.opportunity_id
  join crm.pipeline_stages stage on stage.id = opportunity.stage_id
  where mapped.inferred_substage is not null
    and mapped.inferred_stage = upper(trim(stage.name))
    and nullif(trim(opportunity.lost_reason), '') is null
  order by mapped.opportunity_id, mapped.created_at desc
)
update crm.opportunities opportunity
set
  lost_reason = last_match.inferred_substage,
  updated_at = now()
from last_match
where opportunity.id = last_match.opportunity_id
  and nullif(trim(opportunity.lost_reason), '') is null;

update crm.opportunities opportunity
set
  lost_reason = case upper(trim(conversation.classification))
    when 'CHATBOT' then 'Chatbot'
    when 'SEM RETORNO' then 'Sem retorno'
    when 'AMOSTRA' then 'Pediu amostra'
    when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
    when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'Encaminhado para o distribuidor'
    when 'SEM INTERESSE' then 'Sem interesse'
    when 'NÃO ATENDEMOS A REGIÃO' then 'Não atendemos a região'
    when 'NÃO TEMOS O PÃO' then 'Não temos o pão'
    when 'NÃO RESPONDE' then 'Não responde'
    when 'NÃO INAUGUROU' then 'Não inaugurou'
    when 'SEM PEDIDO MÍNIMO' then 'Sem pedido mínimo'
  end,
  updated_at = now()
from crm.conversations conversation,
     crm.pipeline_stages stage
where conversation.lead_id = opportunity.lead_id
  and stage.id = opportunity.stage_id
  and nullif(trim(opportunity.lost_reason), '') is null
  and conversation.classification is not null
  and case upper(trim(conversation.classification))
    when 'CHATBOT' then 'LEADS'
    when 'SEM RETORNO' then 'QUALIFICAÇÃO'
    when 'AMOSTRA' then 'NEGOCIAÇÃO'
    when 'ENCAMINHADO PARA O DISTRIBUIDOR' then 'NEGOCIAÇÃO'
    when 'ENCAMINHADO PARA DISTRIBUIDOR' then 'NEGOCIAÇÃO'
    when 'SEM INTERESSE' then 'PERDIDO'
    when 'NÃO ATENDEMOS A REGIÃO' then 'PERDIDO'
    when 'NÃO TEMOS O PÃO' then 'PERDIDO'
    when 'NÃO RESPONDE' then 'PERDIDO'
    when 'NÃO INAUGUROU' then 'PERDIDO'
    when 'SEM PEDIDO MÍNIMO' then 'PERDIDO'
  end = upper(trim(stage.name));

update crm.opportunities opportunity
set
  lost_reason = 'Pediu amostra',
  updated_at = now()
from crm.pipeline_stages stage
where stage.id = opportunity.stage_id
  and upper(trim(stage.name)) = 'NEGOCIAÇÃO'
  and nullif(trim(opportunity.lost_reason), '') is null
  and exists (
    select 1
    from crm.sample_shipments sample
    where sample.lead_id = opportunity.lead_id
  );

-- Restaura a classificação do chat só quando já há subetapa recuperada,
-- sem o trigger mexer na etapa do funil.
alter table crm.conversations disable trigger conversations_sync_negotiation_pipeline;

update crm.conversations conversation
set
  classification = case
    when lower(trim(opportunity.lost_reason)) = 'chatbot' then 'CHATBOT'
    when lower(trim(opportunity.lost_reason)) = 'sem retorno' then 'SEM RETORNO'
    when lower(trim(opportunity.lost_reason)) in ('pediu amostra', 'recebeu amostra') then 'AMOSTRA'
    when lower(trim(opportunity.lost_reason)) = 'encaminhado para o distribuidor' then 'ENCAMINHADO PARA O DISTRIBUIDOR'
    when lower(trim(opportunity.lost_reason)) = 'sem interesse' then 'SEM INTERESSE'
    when lower(trim(opportunity.lost_reason)) = 'não atendemos a região' then 'NÃO ATENDEMOS A REGIÃO'
    when lower(trim(opportunity.lost_reason)) = 'não temos o pão' then 'NÃO TEMOS O PÃO'
    when lower(trim(opportunity.lost_reason)) = 'não responde' then 'NÃO RESPONDE'
    when lower(trim(opportunity.lost_reason)) = 'não inaugurou' then 'NÃO INAUGUROU'
    when lower(trim(opportunity.lost_reason)) = 'sem pedido mínimo' then 'SEM PEDIDO MÍNIMO'
  end,
  updated_at = now()
from crm.opportunities opportunity
where opportunity.lead_id = conversation.lead_id
  and conversation.classification is null
  and nullif(trim(opportunity.lost_reason), '') is not null
  and case
    when lower(trim(opportunity.lost_reason)) = 'chatbot' then 'CHATBOT'
    when lower(trim(opportunity.lost_reason)) = 'sem retorno' then 'SEM RETORNO'
    when lower(trim(opportunity.lost_reason)) in ('pediu amostra', 'recebeu amostra') then 'AMOSTRA'
    when lower(trim(opportunity.lost_reason)) = 'encaminhado para o distribuidor' then 'ENCAMINHADO PARA O DISTRIBUIDOR'
    when lower(trim(opportunity.lost_reason)) = 'sem interesse' then 'SEM INTERESSE'
    when lower(trim(opportunity.lost_reason)) = 'não atendemos a região' then 'NÃO ATENDEMOS A REGIÃO'
    when lower(trim(opportunity.lost_reason)) = 'não temos o pão' then 'NÃO TEMOS O PÃO'
    when lower(trim(opportunity.lost_reason)) = 'não responde' then 'NÃO RESPONDE'
    when lower(trim(opportunity.lost_reason)) = 'não inaugurou' then 'NÃO INAUGUROU'
    when lower(trim(opportunity.lost_reason)) = 'sem pedido mínimo' then 'SEM PEDIDO MÍNIMO'
  end is not null;

alter table crm.conversations enable trigger conversations_sync_negotiation_pipeline;

commit;
