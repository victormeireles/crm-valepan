-- Rode no Supabase: SQL Editor → New query → Run
-- Preenche estágios padrão se a tabela estiver vazia (erro do webhook: pipeline_stages vazio).

do $$
begin
  if not exists (select 1 from crm.pipeline_stages limit 1) then
    insert into crm.pipeline_stages (name, sort_order, is_final) values
      ('LEADS', 10, false),
      ('QUALIFICAÇÃO', 20, false),
      ('NEGOCIAÇÃO', 30, false),
      ('ENCAMINHADO PARA DISTRIBUIDOR', 40, false),
      ('AMOSTRA', 50, false),
      ('CHATBOT', 60, false),
      ('SEM RETORNO', 70, false),
      ('CONVERTIDO', 80, true),
      ('JÁ É CLIENTE', 140, false),
      ('NÃO ATENDEMOS A REGIÃO', 150, false),
      ('NÃO RESPONDE', 160, false),
      ('NÃO TEMOS O PÃO', 170, false),
      ('SEM INTERESSE', 190, true);
  end if;
end $$;
