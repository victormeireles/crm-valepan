alter table crm.conversations
  drop constraint if exists conversations_classification_allowed;

update crm.conversations
set classification = case
  when classification is null then null
  else upper(classification)
end;

alter table crm.conversations
  add constraint conversations_classification_allowed
  check (
    classification is null
    or classification in (
      'CLIENTE',
      'AMOSTRA',
      'NEGOCIAÇÃO',
      'SEM INTERESSE',
      'ENCAMINHADO PARA O DISTRIBUIDOR',
      'NÃO ATENDEMOS A REGIÃO',
      'NÃO TEMOS O PÃO',
      'NÃO RESPONDE',
      'JÁ É CLIENTE'
    )
  );
