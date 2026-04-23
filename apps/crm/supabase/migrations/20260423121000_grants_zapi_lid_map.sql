-- Garante acesso à tabela de mapeamento LID para os papéis usados no app/webhook.
grant select, insert, update, delete on table crm.zapi_lid_map to authenticated, service_role;
