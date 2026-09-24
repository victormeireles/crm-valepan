begin;

-- A tabela foi criada depois do grant inicial do schema. Sem este acesso, a
-- relação embutida em mensagens falha e o Inbox perde também os campos da
-- mídia privada ao usar o fallback legado.
grant select, insert, delete on table crm.message_favorites
  to authenticated, service_role;

commit;
