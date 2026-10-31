-- O papel do CRM não pode ser escolhido por quem se cadastra nem alterado
-- pela própria sessão. raw_user_meta_data.role é editável pelo usuário.

create or replace function crm.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  requested text;
begin
  requested := lower(trim(coalesce(new.raw_app_meta_data->>'role', '')));

  if requested not in ('admin', 'comercial', 'gestao', 'operacao') then
    return new;
  end if;

  insert into crm.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    requested::crm.user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function crm.handle_new_user() is
  'Cria perfil só quando raw_app_meta_data.role é admin, comercial, gestao ou operacao.';

revoke all on function crm.handle_new_user() from public, anon, authenticated;
grant execute on function crm.handle_new_user() to supabase_auth_admin;

create or replace function crm.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = crm, public
as $$
begin
  if current_user = 'authenticated'
     and (
       new.role is distinct from old.role
       or new.id is distinct from old.id
     ) then
    raise exception 'profile_privilege_change_forbidden'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function crm.protect_profile_privileges() is
  'Impede que a sessão authenticated altere o papel ou o id do perfil.';

revoke all on function crm.protect_profile_privileges() from public, anon;
grant execute on function crm.protect_profile_privileges() to authenticated;

drop trigger if exists protect_profile_privileges on crm.profiles;
create trigger protect_profile_privileges
  before update on crm.profiles
  for each row
  execute function crm.protect_profile_privileges();

revoke insert, delete, truncate, update on table crm.profiles from authenticated;
grant update (full_name, updated_at) on table crm.profiles to authenticated;
