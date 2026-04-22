-- Rode no Supabase: SQL Editor → New query → Run
-- Preenche estágios padrão se a tabela estiver vazia (erro do webhook: pipeline_stages vazio).

do $$
begin
  if not exists (select 1 from crm.pipeline_stages limit 1) then
    insert into crm.pipeline_stages (name, sort_order, is_final) values
      ('Lead novo', 10, false),
      ('Qualificação', 20, false),
      ('Negociação', 40, false),
      ('Amostra', 50, false),
      ('Convertido', 100, true),
      ('Perdido', 110, true);
  end if;
end $$;
