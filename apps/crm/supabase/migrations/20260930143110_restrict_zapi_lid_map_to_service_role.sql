-- CRM accesses this map only through createAdminSupabaseClient (service_role).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL PRIVILEGES ON TABLE crm.zapi_lid_map FROM PUBLIC, anon, authenticated;
ALTER TABLE crm.zapi_lid_map ENABLE ROW LEVEL SECURITY;

DO $check$
BEGIN
  IF has_table_privilege('anon', 'crm.zapi_lid_map', 'SELECT')
    OR has_table_privilege('authenticated', 'crm.zapi_lid_map', 'SELECT')
    OR has_table_privilege('authenticated', 'crm.zapi_lid_map', 'INSERT')
    OR has_table_privilege('authenticated', 'crm.zapi_lid_map', 'UPDATE')
    OR has_table_privilege('authenticated', 'crm.zapi_lid_map', 'DELETE') THEN
    RAISE EXCEPTION 'Client access remains on crm.zapi_lid_map';
  END IF;
  IF NOT has_table_privilege('service_role', 'crm.zapi_lid_map', 'SELECT')
    OR NOT has_table_privilege('service_role', 'crm.zapi_lid_map', 'INSERT')
    OR NOT has_table_privilege('service_role', 'crm.zapi_lid_map', 'UPDATE') THEN
    RAISE EXCEPTION 'Backend access missing on crm.zapi_lid_map';
  END IF;
END
$check$;
COMMIT;
