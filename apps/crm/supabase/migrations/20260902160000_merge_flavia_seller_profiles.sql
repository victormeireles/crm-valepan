do $$
declare
  source_profile_id uuid;
  target_profile_id uuid;
begin
  select id
    into source_profile_id
  from crm.profiles
  where lower(trim(full_name)) = 'flavia'
  order by created_at
  limit 1;

  select id
    into target_profile_id
  from crm.profiles
  where lower(trim(full_name)) = 'flávia nazário'
  order by created_at
  limit 1;

  if source_profile_id is null or target_profile_id is null then
    raise exception 'Perfis de origem e destino da Flávia não foram encontrados';
  end if;

  if source_profile_id = target_profile_id then
    raise exception 'Os perfis de origem e destino da Flávia são iguais';
  end if;

  update crm.leads
  set owner_id = target_profile_id
  where owner_id = source_profile_id;

  update crm.opportunities
  set owner_id = target_profile_id
  where owner_id = source_profile_id;

  update crm.tasks
  set assignee_id = target_profile_id
  where assignee_id = source_profile_id;

  update crm.notes
  set author_id = target_profile_id
  where author_id = source_profile_id;

  update crm.activity_logs
  set actor_id = target_profile_id
  where actor_id = source_profile_id;

  update crm.leads
  set excluded_by = target_profile_id
  where excluded_by = source_profile_id;

  update crm.messages
  set deleted_by = target_profile_id
  where deleted_by = source_profile_id;

  insert into crm.message_favorites (message_id, user_id, created_at)
  select message_id, target_profile_id, created_at
  from crm.message_favorites
  where user_id = source_profile_id
  on conflict (message_id, user_id) do nothing;

  delete from crm.message_favorites
  where user_id = source_profile_id;

  update crm.profiles
  set full_name = 'Flávia Nazário', updated_at = now()
  where id = target_profile_id;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', 'Flávia Nazário'),
      updated_at = now()
  where id = target_profile_id;

  delete from auth.users
  where id = source_profile_id;
end;
$$;
