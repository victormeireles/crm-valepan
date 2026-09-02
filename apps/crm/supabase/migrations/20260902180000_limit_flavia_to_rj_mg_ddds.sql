-- Filtro provisório da carteira da Flávia: somente leads dos estados do
-- Rio de Janeiro e de Minas Gerais, identificados pelo DDD do telefone.

begin;

create or replace function crm.is_flavia_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select exists (
    select 1
    from crm.profiles p
    where p.id = p_profile_id
      and lower(trim(p.full_name)) in ('flavia', 'flavia nazario', 'flávia nazário')
  );
$$;

create or replace function crm.is_rj_or_mg_phone(p_phone text)
returns boolean
language sql
immutable
strict
as $$
  select regexp_replace(p_phone, '[^0-9]', '', 'g') ~
    '^(55)?(21|22|24|31|32|33|34|35|37|38)';
$$;

create or replace function crm.can_view_flavia_sales_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select
    crm.can_view_lead(p_lead_id)
    and (
      crm.current_role() in ('admin'::crm.user_role, 'gestao'::crm.user_role)
      or not crm.is_flavia_profile(auth.uid())
      or exists (
        select 1
        from crm.leads l
        where l.id = p_lead_id
          and crm.is_rj_or_mg_phone(l.phone_e164)
      )
    );
$$;

comment on function crm.is_rj_or_mg_phone(text) is
  'Filtro provisório: aceita DDDs 21, 22 e 24 (RJ) e 31, 32, 33, 34, 35, 37 e 38 (MG).';

comment on function crm.can_view_flavia_sales_lead(uuid) is
  'Mantém a visibilidade padrão e limita provisoriamente o chat e o funil da Flávia aos DDDs de RJ e MG.';

revoke all on function crm.is_flavia_profile(uuid) from public;
grant execute on function crm.is_flavia_profile(uuid) to authenticated, service_role;

revoke all on function crm.is_rj_or_mg_phone(text) from public;
grant execute on function crm.is_rj_or_mg_phone(text) to authenticated, service_role;

revoke all on function crm.can_view_flavia_sales_lead(uuid) from public;
grant execute on function crm.can_view_flavia_sales_lead(uuid) to authenticated, service_role;

drop policy if exists opportunities_by_visible_lead on crm.opportunities;
create policy opportunities_by_visible_lead on crm.opportunities
  for all to authenticated
  using (crm.can_view_flavia_sales_lead(lead_id))
  with check (crm.can_view_flavia_sales_lead(lead_id));

drop policy if exists conversations_by_visible_lead on crm.conversations;
create policy conversations_by_visible_lead on crm.conversations
  for all to authenticated
  using (crm.can_view_flavia_sales_lead(lead_id))
  with check (crm.can_view_flavia_sales_lead(lead_id));

drop policy if exists messages_by_visible_lead_select on crm.messages;
create policy messages_by_visible_lead_select on crm.messages
  for select to authenticated
  using (
    exists (
      select 1
      from crm.conversations c
      where c.id = messages.conversation_id
        and crm.can_view_flavia_sales_lead(c.lead_id)
    )
  );

drop policy if exists messages_by_visible_lead_insert on crm.messages;
create policy messages_by_visible_lead_insert on crm.messages
  for insert to authenticated
  with check (
    exists (
      select 1
      from crm.conversations c
      where c.id = messages.conversation_id
        and crm.can_view_flavia_sales_lead(c.lead_id)
    )
  );

commit;
