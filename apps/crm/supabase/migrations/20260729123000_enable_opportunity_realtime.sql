-- Mantém as filas do Chat sincronizadas quando uma oportunidade muda de etapa.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'crm'
      and tablename = 'opportunities'
  ) then
    alter publication supabase_realtime add table crm.opportunities;
  end if;
end
$$;
