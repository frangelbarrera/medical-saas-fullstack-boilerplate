-- Database-enforced tenant isolation (SEC-005).
--
-- Every tenant table gets row-level security keyed on the connection-local
-- setting `app.current_clinic_id`, which the application sets at the start of
-- every transaction (see services/data/src/tenant.ts). The runtime role
-- (`medical_app`) is NOT the table owner and cannot bypass these policies.
--
-- The audit log is additionally made append-only for the runtime role
-- (INSERT + SELECT only) to enforce write-once audit semantics.

-- Fail fast if the application role is missing: it must be provisioned before
-- migrations are applied (ops/db/init/01-app-role.sql or docker compose).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medical_app') THEN
    RAISE EXCEPTION 'Role medical_app not found. Provision it with ops/db/init/01-app-role.sql before applying this migration.';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO medical_app;

-- Tenant tables: enable RLS + permissive policy for the runtime role.
-- `clinics` is the tenant root table: its rows ARE the tenants, so the policy
-- matches on `id` instead of `clinic_id`.
DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'patients',
    'patient_identifiers',
    'patient_consents',
    'payers',
    'appointments',
    'availability_rules',
    'encounters',
    'encounter_versions',
    'observations',
    'problems',
    'allergies',
    'medication_orders',
    'break_glass_accesses',
    'threads',
    'thread_participants',
    'messages',
    'notifications',
    'invoices',
    'invoice_items',
    'payments',
    'expenses',
    'audit_logs',
    'dsar_requests',
    'ai_conversations',
    'ai_messages',
    'ai_drafts',
    'prompt_templates'
  ];
BEGIN
  -- The tenant root: a clinic row is only visible to its own tenant context.
  ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
  EXECUTE 'CREATE POLICY tenant_isolation ON clinics FOR ALL TO medical_app USING (id = current_setting(''app.current_clinic_id'', true)) WITH CHECK (id = current_setting(''app.current_clinic_id'', true));';

  -- Users: tenant-scoped, EXCEPT username lookups during login. The
  -- application sets `app.auth_lookup` only inside the login code path;
  -- writes stay strictly tenant-scoped (WITH CHECK has no bypass).
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  EXECUTE 'CREATE POLICY tenant_isolation ON users FOR ALL TO medical_app USING (clinic_id = current_setting(''app.current_clinic_id'', true) OR current_setting(''app.auth_lookup'', true) = ''on'') WITH CHECK (clinic_id = current_setting(''app.current_clinic_id'', true));';

  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO medical_app USING (clinic_id = current_setting(''app.current_clinic_id'', true)) WITH CHECK (clinic_id = current_setting(''app.current_clinic_id'', true));',
      t
    );
  END LOOP;
END
$$;

-- Infrastructure tables (no PHI, accessed before tenant context is known):
-- no RLS, but the runtime role still gets least-privilege grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, refresh_tokens, webhook_events TO medical_app;

-- Tenant tables: full CRUD for the runtime role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medical_app;

-- Sequences (audit_logs.seq).
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO medical_app;

-- Audit log is append-only for the runtime role (WORM).
REVOKE UPDATE, DELETE ON audit_logs FROM medical_app;

-- Future tables created by the migration role inherit the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medical_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO medical_app;
