-- Flag de análise da IA no funil + subetapa nas sugestões.
-- Regras automáticas (sem IA):
--   só inbound → LEADS / Chatbot e marca analisado
--   já respondemos e o cliente ainda não → QUALIFICAÇÃO / Sem retorno e marca analisado
--   cliente respondeu depois da gente → desmarca para o job/IA classificar etapa+subetapa

begin;

alter table crm.conversations
  add column if not exists pipeline_ai_analyzed boolean not null default false;

comment on column crm.conversations.pipeline_ai_analyzed is
  'true = job/IA já viu este estado; nova resposta do cliente depois de falarmos desmarca.';

create index if not exists conversations_pipeline_ai_pending
  on crm.conversations (last_message_at desc nulls last)
  where pipeline_ai_analyzed = false
    and conversation_kind = 'lead';

alter table crm.pipeline_advance_suggestions
  add column if not exists from_substage text;

alter table crm.pipeline_advance_suggestions
  add column if not exists to_substage text;

create or replace function crm.touch_pipeline_ai_on_message()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  conv record;
  has_prior_out boolean;
  current_stage text;
  at_leads boolean;
begin
  if new.direction is null or new.direction not in ('in', 'out') then
    return new;
  end if;

  select *
    into conv
  from crm.conversations
  where id = new.conversation_id;

  if conv.id is null then
    return new;
  end if;
  if conv.conversation_kind is distinct from 'lead' then
    return new;
  end if;

  select exists(
    select 1
    from crm.messages m
    where m.conversation_id = new.conversation_id
      and m.direction = 'out'
      and m.deleted_at is null
      and m.id is distinct from new.id
  ) into has_prior_out;

  select upper(trim(ps.name))
    into current_stage
  from crm.opportunities o
  join crm.pipeline_stages ps on ps.id = o.stage_id
  where o.lead_id = conv.lead_id
  order by o.updated_at desc nulls last
  limit 1;

  at_leads := current_stage is null
    or current_stage in ('LEADS', 'ENTRADA', 'CHATBOT', 'NOVO');

  if new.direction = 'in' then
    if has_prior_out then
      update crm.conversations
      set pipeline_ai_analyzed = false,
          updated_at = now()
      where id = conv.id
        and pipeline_ai_analyzed is distinct from false;
    else
      update crm.conversations
      set pipeline_ai_analyzed = true,
          classification = case
            when at_leads and conv.classification is null then 'CHATBOT'
            else classification
          end,
          updated_at = now()
      where id = conv.id;
    end if;
    return new;
  end if;

  if not has_prior_out then
    update crm.conversations
    set pipeline_ai_analyzed = true,
        classification = case
          when at_leads then 'SEM RETORNO'
          else classification
        end,
        updated_at = now()
    where id = conv.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pipeline_ai_on_message on crm.messages;

create trigger trg_pipeline_ai_on_message
after insert on crm.messages
for each row
execute function crm.touch_pipeline_ai_on_message();

-- Backfill: só o cliente falou.
update crm.conversations c
set pipeline_ai_analyzed = true,
    classification = case
      when c.classification is null
        and coalesce((
          select upper(trim(ps.name))
          from crm.opportunities o
          join crm.pipeline_stages ps on ps.id = o.stage_id
          where o.lead_id = c.lead_id
          order by o.updated_at desc nulls last
          limit 1
        ), 'LEADS') in ('LEADS', 'ENTRADA', 'CHATBOT', 'NOVO')
        then 'CHATBOT'
      else c.classification
    end,
    updated_at = now()
where c.conversation_kind = 'lead'
  and exists (
    select 1
    from crm.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and m.direction = 'in'
  )
  and not exists (
    select 1
    from crm.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and m.direction = 'out'
  );

-- Backfill: já respondemos e o cliente ainda não voltou.
update crm.conversations c
set pipeline_ai_analyzed = true,
    classification = case
      when coalesce((
        select upper(trim(ps.name))
        from crm.opportunities o
        join crm.pipeline_stages ps on ps.id = o.stage_id
        where o.lead_id = c.lead_id
        order by o.updated_at desc nulls last
        limit 1
      ), 'LEADS') in ('LEADS', 'ENTRADA', 'CHATBOT', 'NOVO')
        then 'SEM RETORNO'
      else c.classification
    end,
    updated_at = now()
where c.conversation_kind = 'lead'
  and exists (
    select 1
    from crm.messages last_msg
    where last_msg.conversation_id = c.id
      and last_msg.deleted_at is null
      and last_msg.direction = 'out'
      and not exists (
        select 1
        from crm.messages newer
        where newer.conversation_id = c.id
          and newer.deleted_at is null
          and (newer.sent_at, newer.id) > (last_msg.sent_at, last_msg.id)
      )
  )
  and exists (
    select 1
    from crm.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and m.direction = 'out'
  );

-- Backfill: cliente respondeu depois da gente — apto para a IA.
update crm.conversations c
set pipeline_ai_analyzed = false,
    updated_at = now()
where c.conversation_kind = 'lead'
  and exists (
    select 1
    from crm.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and m.direction = 'out'
  )
  and exists (
    select 1
    from crm.messages last_msg
    where last_msg.conversation_id = c.id
      and last_msg.deleted_at is null
      and last_msg.direction = 'in'
      and not exists (
        select 1
        from crm.messages newer
        where newer.conversation_id = c.id
          and newer.deleted_at is null
          and (newer.sent_at, newer.id) > (last_msg.sent_at, last_msg.id)
      )
  );

commit;
