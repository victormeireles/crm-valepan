-- Comercial continua vendo a entrada e a própria carteira. Lead sem
-- responsável em Qualificação / Sem retorno também fica na fila compartilhada:
-- o avanço automático tira o card da entrada sem atribuir dono.

begin;

create or replace function crm.can_view_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select
    crm.is_member()
    and (
      crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role)
      or exists (
        select 1
        from crm.leads l
        where l.id = p_lead_id
          and l.owner_id = auth.uid()
      )
      or exists (
        select 1
        from crm.opportunities o
        inner join crm.pipeline_stages ps on ps.id = o.stage_id
        where o.lead_id = p_lead_id
          and upper(trim(ps.name)) in ('LEADS', 'ENTRADA', 'LEAD NOVO')
      )
      or exists (
        select 1
        from crm.leads l
        join lateral (
          select o.lost_reason, ps.name as stage_name
          from crm.opportunities o
          inner join crm.pipeline_stages ps on ps.id = o.stage_id
          where o.lead_id = l.id
          order by o.updated_at desc nulls last, o.id desc
          limit 1
        ) current_opportunity on true
        where l.id = p_lead_id
          and l.owner_id is null
          and (
            upper(trim(current_opportunity.stage_name)) = 'SEM RETORNO'
            or (
              upper(trim(current_opportunity.stage_name)) = 'QUALIFICAÇÃO'
              and (
                lower(trim(coalesce(current_opportunity.lost_reason, ''))) = 'sem retorno'
                or (
                  nullif(trim(coalesce(current_opportunity.lost_reason, '')), '') is null
                  and exists (
                    select 1
                    from crm.conversations c
                    where c.lead_id = l.id
                      and c.conversation_kind = 'lead'
                      and upper(trim(coalesce(c.classification, ''))) = 'SEM RETORNO'
                  )
                )
              )
            )
          )
      )
    );
$$;

comment on function crm.can_view_lead(uuid) is
  'Admin e gestão veem todos. Demais membros veem a entrada, a qualificação sem retorno ainda sem responsável, e a própria carteira.';

commit;
