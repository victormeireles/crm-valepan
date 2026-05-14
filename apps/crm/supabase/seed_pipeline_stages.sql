-- Rode no Supabase: SQL Editor → New query → Run
-- Preenche estágios padrão se a tabela estiver vazia (erro do webhook: pipeline_stages vazio).

do $$
begin
  if not exists (select 1 from crm.pipeline_stages limit 1) then
    insert into crm.pipeline_stages (name, sort_order, is_final) values
      ('LEADS', 5, false),
      ('QUALIFICAÇÃO', 10, false),
      ('AMOSTRA', 20, false),
      ('ENCAMINHADO PARA DISTRIBUIDOR', 30, false),
      ('JÁ É CLIENTE', 40, false),
      ('NÃO ATENDEMOS A REGIÃO', 50, false),
      ('NÃO RESPONDE', 60, false),
      ('NÃO TEMOS O PÃO', 70, false),
      ('NEGOCIAÇÃO', 80, false),
      ('SEM INTERESSE', 90, true),
      ('CONVERTIDO', 100, true);
  end if;
end $$;
