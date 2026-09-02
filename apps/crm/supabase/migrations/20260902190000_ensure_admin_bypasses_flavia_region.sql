-- Garante a correção também em ambientes onde a migração anterior já tenha
-- sido aplicada: administração e gestão nunca recebem o recorte da Flávia.

begin;

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

comment on function crm.can_view_flavia_sales_lead(uuid) is
  'Administração e gestão veem tudo; somente a Flávia fica provisoriamente limitada aos DDDs de RJ e MG no chat e no funil.';

commit;
