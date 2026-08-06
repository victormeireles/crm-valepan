-- Eventos usados pelo Inbox para substituir o polling de 20 segundos.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['messages', 'conversations', 'leads', 'tasks']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'crm'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table %I.%I',
        'crm',
        table_name
      );
    end if;
  end loop;
end
$$;
