-- Permite definir papel inicial via raw_user_meta_data.role (ex.: seed admin)
create or replace function crm.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  r crm.user_role;
begin
  r := case coalesce(new.raw_user_meta_data->>'role', '')
    when 'admin' then 'admin'::crm.user_role
    when 'comercial' then 'comercial'::crm.user_role
    when 'gestao' then 'gestao'::crm.user_role
    when 'operacao' then 'operacao'::crm.user_role
    else 'comercial'::crm.user_role
  end;

  insert into crm.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    r
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
