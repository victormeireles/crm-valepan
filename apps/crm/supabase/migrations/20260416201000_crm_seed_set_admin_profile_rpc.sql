-- RPC usada pelo script seed:admin (service role) para ajustar perfil sem depender do schema `crm` na API REST.
create or replace function public.crm_seed_set_admin_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  insert into crm.profiles (id, full_name, role)
  values (p_user_id, 'Administrador', 'admin'::crm.user_role)
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();
end;
$$;

revoke all on function public.crm_seed_set_admin_profile(uuid) from public;
grant execute on function public.crm_seed_set_admin_profile(uuid) to service_role;
