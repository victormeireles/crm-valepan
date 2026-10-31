-- Sessão autenticada deixa de ser suficiente. Catálogo compartilhado exige
-- perfil do CRM. Dados de um lead seguem a mesma visibilidade do lead.

create or replace function crm.is_member()
returns boolean
language sql
stable
security definer
set search_path = crm, public
as $$
  select exists (
    select 1
    from crm.profiles
    where id = auth.uid()
      and role in (
        'admin'::crm.user_role,
        'comercial'::crm.user_role,
        'gestao'::crm.user_role,
        'operacao'::crm.user_role
      )
  );
$$;

comment on function crm.is_member() is
  'Verdadeiro quando a sessão tem um perfil autorizado no CRM.';

revoke all on function crm.is_member() from public, anon, authenticated;
grant execute on function crm.is_member() to authenticated, service_role;

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
    );
$$;

comment on function crm.can_view_lead(uuid) is
  'Admin e gestão veem todos. Demais membros veem a entrada e a própria carteira. Sem perfil, não vê.';

drop policy if exists profiles_select on crm.profiles;
create policy profiles_select on crm.profiles
  for select to authenticated
  using ((select crm.is_member()));

drop policy if exists profiles_update_self on crm.profiles;
create policy profiles_update_self on crm.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select crm.is_member()))
  with check (id = (select auth.uid()) and (select crm.is_member()));

drop policy if exists companies_all on crm.companies;
create policy companies_all on crm.companies
  for all to authenticated
  using ((select crm.is_member()))
  with check ((select crm.is_member()));

drop policy if exists contacts_all on crm.contacts;
create policy contacts_all on crm.contacts
  for all to authenticated
  using ((select crm.is_member()))
  with check ((select crm.is_member()));

drop policy if exists distributors_all on crm.distributors;
create policy distributors_all on crm.distributors
  for all to authenticated
  using ((select crm.is_member()))
  with check ((select crm.is_member()));

drop policy if exists distributor_regions_all on crm.distributor_regions;
create policy distributor_regions_all on crm.distributor_regions
  for all to authenticated
  using ((select crm.is_member()))
  with check ((select crm.is_member()));

drop policy if exists stages_select on crm.pipeline_stages;
create policy stages_select on crm.pipeline_stages
  for select to authenticated
  using ((select crm.is_member()));

drop policy if exists lost_reasons_select on crm.lost_reasons;
create policy lost_reasons_select on crm.lost_reasons
  for select to authenticated
  using ((select crm.is_member()));

drop policy if exists pipeline_stage_task_templates_select on crm.pipeline_stage_task_templates;
create policy pipeline_stage_task_templates_select on crm.pipeline_stage_task_templates
  for select to authenticated
  using ((select crm.is_member()));

drop policy if exists pipeline_stage_automation_log_all on crm.pipeline_stage_automation_log;
create policy pipeline_stage_automation_log_all on crm.pipeline_stage_automation_log
  for all to authenticated
  using ((select crm.is_member()))
  with check ((select crm.is_member()));

drop policy if exists message_favorites_own on crm.message_favorites;
create policy message_favorites_own on crm.message_favorites
  for all to authenticated
  using (user_id = (select auth.uid()) and (select crm.is_member()))
  with check (user_id = (select auth.uid()) and (select crm.is_member()));

drop policy if exists leads_insert_authenticated on crm.leads;
create policy leads_insert_authenticated on crm.leads
  for insert to authenticated
  with check (
    (select crm.is_member())
    and (
      owner_id is null
      or owner_id = (select auth.uid())
      or (select crm.current_role()) in ('admin'::crm.user_role, 'gestao'::crm.user_role)
    )
  );

drop policy if exists leads_update_by_seller on crm.leads;
create policy leads_update_by_seller on crm.leads
  for update to authenticated
  using (crm.can_view_flavia_sales_lead(id))
  with check (crm.can_view_flavia_sales_lead(id));

drop policy if exists leads_delete_by_seller on crm.leads;
create policy leads_delete_by_seller on crm.leads
  for delete to authenticated
  using (crm.can_view_flavia_sales_lead(id));

drop policy if exists messages_update on crm.messages;
create policy messages_update on crm.messages
  for update to authenticated
  using (
    exists (
      select 1
      from crm.conversations c
      where c.id = messages.conversation_id
        and crm.can_view_flavia_sales_lead(c.lead_id)
    )
  )
  with check (
    exists (
      select 1
      from crm.conversations c
      where c.id = conversation_id
        and crm.can_view_flavia_sales_lead(c.lead_id)
    )
  );

drop policy if exists notes_all on crm.notes;
create policy notes_all on crm.notes
  for all to authenticated
  using (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  )
  with check (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  );

drop policy if exists tasks_all on crm.tasks;
create policy tasks_all on crm.tasks
  for all to authenticated
  using (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  )
  with check (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  );

drop policy if exists samples_all on crm.sample_shipments;
create policy samples_all on crm.sample_shipments
  for all to authenticated
  using (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  )
  with check (
    (select crm.is_member())
    and (
      lead_id is null
      or crm.can_view_flavia_sales_lead(lead_id)
    )
  );

drop policy if exists sample_items_all on crm.sample_items;
create policy sample_items_all on crm.sample_items
  for all to authenticated
  using (
    exists (
      select 1
      from crm.sample_shipments s
      where s.id = sample_items.shipment_id
        and (select crm.is_member())
        and (
          s.lead_id is null
          or crm.can_view_flavia_sales_lead(s.lead_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from crm.sample_shipments s
      where s.id = shipment_id
        and (select crm.is_member())
        and (
          s.lead_id is null
          or crm.can_view_flavia_sales_lead(s.lead_id)
        )
    )
  );

drop policy if exists activity_select on crm.activity_logs;
create policy activity_select on crm.activity_logs
  for select to authenticated
  using (
    (select crm.is_member())
    and (
      (select crm.current_role()) in ('admin'::crm.user_role, 'gestao'::crm.user_role)
      or (
        entity_type = 'lead'
        and crm.can_view_flavia_sales_lead(entity_id)
      )
      or (
        entity_type = 'opportunity'
        and exists (
          select 1
          from crm.opportunities o
          where o.id = activity_logs.entity_id
            and crm.can_view_flavia_sales_lead(o.lead_id)
        )
      )
    )
  );

drop policy if exists activity_insert on crm.activity_logs;
create policy activity_insert on crm.activity_logs
  for insert to authenticated
  with check (
    (select crm.is_member())
    and (
      (select crm.current_role()) in ('admin'::crm.user_role, 'gestao'::crm.user_role)
      or (
        entity_type = 'lead'
        and crm.can_view_flavia_sales_lead(entity_id)
      )
      or (
        entity_type = 'opportunity'
        and exists (
          select 1
          from crm.opportunities o
          where o.id = entity_id
            and crm.can_view_flavia_sales_lead(o.lead_id)
        )
      )
    )
  );
