-- Run only if explicitly requested; restores the grants and RLS state observed 2026-09-29.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE crm.zapi_lid_map DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.zapi_lid_map TO authenticated;
COMMIT;
