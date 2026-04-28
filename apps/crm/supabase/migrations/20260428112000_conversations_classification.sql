alter table crm.conversations
  add column if not exists classification text;

alter table crm.conversations
  drop constraint if exists conversations_classification_allowed;

alter table crm.conversations
  add constraint conversations_classification_allowed
  check (
    classification is null
    or classification in (
      'cliente',
      'amostra',
      'negociação',
      'sem interesse',
      'encaminhado para o distribuidor',
      'não atendemos a região',
      'não temos o pão',
      'não responde',
      'já é cliente'
    )
  );
