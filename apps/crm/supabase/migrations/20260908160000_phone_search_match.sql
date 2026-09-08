-- Compara telefones usando somente dígitos e considera a representação
-- histórica de celulares brasileiros com/sem o nono dígito após o DDD.
begin;

create or replace function crm.phone_search_matches(
  p_stored text,
  p_query text
)
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path = crm, public
as $$
declare
  stored_digits text := regexp_replace(coalesce(p_stored, ''), '\D', '', 'g');
  query_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  stored_national text;
  query_national text;
  alternate_query text := null;
begin
  if length(query_digits) < 4 or stored_digits = '' then
    return false;
  end if;

  if position(query_digits in stored_digits) > 0 then
    return true;
  end if;

  stored_national := case
    when stored_digits like '55%' and length(stored_digits) in (12, 13)
      then substring(stored_digits from 3)
    else stored_digits
  end;
  query_national := case
    when query_digits like '55%' and length(query_digits) in (12, 13)
      then substring(query_digits from 3)
    else query_digits
  end;

  if position(query_national in stored_national) > 0 then
    return true;
  end if;

  if length(query_national) = 11
    and substring(query_national from 3 for 1) = '9'
    and substring(query_national from 4 for 1) ~ '[6-9]'
  then
    alternate_query := substring(query_national from 1 for 2) || substring(query_national from 4);
  elsif length(query_national) = 10 and substring(query_national from 3 for 1) ~ '[6-9]' then
    alternate_query := substring(query_national from 1 for 2) || '9' || substring(query_national from 3);
  elsif length(query_national) = 9
    and substring(query_national from 1 for 1) = '9'
    and substring(query_national from 2 for 1) ~ '[6-9]'
  then
    alternate_query := substring(query_national from 2);
  elsif length(query_national) = 8 and substring(query_national from 1 for 1) ~ '[6-9]' then
    alternate_query := '9' || query_national;
  end if;

  return alternate_query is not null
    and right(stored_national, length(alternate_query)) = alternate_query;
end;
$$;

revoke all on function crm.phone_search_matches(text, text) from public;
grant execute on function crm.phone_search_matches(text, text) to authenticated, service_role;

commit;
