-- Vendedores veem somente a fila de novos leads e a própria carteira.
-- Administração e gestão continuam com visão completa.

begin;

create or replace function crm.can_view_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select
    auth.uid() is not null
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
    );
$$;

comment on function crm.can_view_lead(uuid) is
  'Admin/gestão veem todos; demais perfis veem leads na entrada e leads atribuídos a si.';

revoke all on function crm.can_view_lead(uuid) from public;
grant execute on function crm.can_view_lead(uuid) to authenticated, service_role;

drop policy if exists leads_all on crm.leads;
drop policy if exists leads_select_by_seller on crm.leads;
drop policy if exists leads_insert_authenticated on crm.leads;
drop policy if exists leads_update_by_seller on crm.leads;
drop policy if exists leads_delete_by_seller on crm.leads;

create policy leads_select_by_seller on crm.leads
  for select to authenticated
  using (crm.can_view_lead(id));

create policy leads_insert_authenticated on crm.leads
  for insert to authenticated
  with check (true);

create policy leads_update_by_seller on crm.leads
  for update to authenticated
  using (crm.can_view_lead(id))
  with check (crm.can_view_lead(id));

create policy leads_delete_by_seller on crm.leads
  for delete to authenticated
  using (crm.can_view_lead(id));

drop policy if exists opportunities_all on crm.opportunities;
drop policy if exists opportunities_by_visible_lead on crm.opportunities;

create policy opportunities_by_visible_lead on crm.opportunities
  for all to authenticated
  using (crm.can_view_lead(lead_id))
  with check (crm.can_view_lead(lead_id));

drop policy if exists conversations_all on crm.conversations;
drop policy if exists conversations_by_visible_lead on crm.conversations;

create policy conversations_by_visible_lead on crm.conversations
  for all to authenticated
  using (crm.can_view_lead(lead_id))
  with check (crm.can_view_lead(lead_id));

drop policy if exists messages_select on crm.messages;
drop policy if exists messages_insert on crm.messages;
drop policy if exists messages_by_visible_lead_select on crm.messages;
drop policy if exists messages_by_visible_lead_insert on crm.messages;

create policy messages_by_visible_lead_select on crm.messages
  for select to authenticated
  using (
    exists (
      select 1
      from crm.conversations c
      where c.id = messages.conversation_id
        and crm.can_view_lead(c.lead_id)
    )
  );

create policy messages_by_visible_lead_insert on crm.messages
  for insert to authenticated
  with check (
    exists (
      select 1
      from crm.conversations c
      where c.id = messages.conversation_id
        and crm.can_view_lead(c.lead_id)
    )
  );

commit;
