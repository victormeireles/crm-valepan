-- Rode no Supabase: SQL Editor → New query → Run
-- Preenche estágios padrão se a tabela estiver vazia (erro do webhook: pipeline_stages vazio).

do $$
begin
  if not exists (select 1 from crm.pipeline_stages limit 1) then
    insert into crm.pipeline_stages (name, sort_order, is_final) values
      ('LEADS', 10, false),
      ('QUALIFICAÇÃO', 20, false),
      ('NEGOCIAÇÃO', 30, false),
      ('CONVERTIDO', 80, true),
      ('PERDIDO', 90, true);
  end if;
end $$;
