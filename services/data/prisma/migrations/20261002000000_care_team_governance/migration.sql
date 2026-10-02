-- Care-team governance (CLIN-004), DSAR governed release, TOTP MFA and
-- jurisdiction compliance packs.
--
-- Adds:
--   care_team_memberships  tenant table (RLS) - treating relationship backbone
--   dsar_artifacts         tenant table (RLS) - encrypted export artifacts
--   dsar_download_tokens   infrastructure table (hash only, no PHI, no RLS)
--   clinics.jurisdiction   active compliance pack selector
--   users.totp_*           TOTP second factor (secret encrypted at rest)
--   sessions.step_up_at    privileged re-authentication window
--   dsar_requests.*        governed release lifecycle columns
--
-- Backfill: existing primary doctors become CARING_DOCTOR memberships so no
-- clinician loses access to their own patients after the upgrade.

-- Fail fast when the runtime role is missing: RLS policies below target it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medical_app') THEN
    RAISE EXCEPTION 'Role medical_app not found. Provision it with ops/db/init/01-app-role.sql before applying this migration.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- care_team_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE "care_team_memberships" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "member_role" TEXT NOT NULL DEFAULT 'CARING_DOCTOR',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_by_id" TEXT,

    CONSTRAINT "care_team_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "care_team_memberships_clinic_id_patient_id_user_id_member_role_key"
    ON "care_team_memberships"("clinic_id", "patient_id", "user_id", "member_role");
CREATE INDEX "care_team_memberships_clinic_id_user_id_ended_at_idx"
    ON "care_team_memberships"("clinic_id", "user_id", "ended_at");
CREATE INDEX "care_team_memberships_clinic_id_patient_id_ended_at_idx"
    ON "care_team_memberships"("clinic_id", "patient_id", "ended_at");

ALTER TABLE "care_team_memberships" ADD CONSTRAINT "care_team_memberships_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_team_memberships" ADD CONSTRAINT "care_team_memberships_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_team_memberships" ADD CONSTRAINT "care_team_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- dsar_artifacts + dsar_download_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE "dsar_artifacts" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "prepared_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dsar_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dsar_artifacts_clinic_id_request_id_idx" ON "dsar_artifacts"("clinic_id", "request_id");

ALTER TABLE "dsar_artifacts" ADD CONSTRAINT "dsar_artifacts_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_artifacts" ADD CONSTRAINT "dsar_artifacts_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "dsar_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dsar_download_tokens" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dsar_download_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dsar_download_tokens_token_hash_key" ON "dsar_download_tokens"("token_hash");
CREATE INDEX "dsar_download_tokens_request_id_idx" ON "dsar_download_tokens"("request_id");

ALTER TABLE "dsar_download_tokens" ADD CONSTRAINT "dsar_download_tokens_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "dsar_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Column additions
-- ---------------------------------------------------------------------------
ALTER TABLE "clinics" ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'CH';

ALTER TABLE "users" ADD COLUMN "totp_secret_enc" TEXT,
                 ADD COLUMN "totp_enabled_at" TIMESTAMP(3);

ALTER TABLE "sessions" ADD COLUMN "step_up_at" TIMESTAMP(3);

ALTER TABLE "dsar_requests" ADD COLUMN "prepared_by_id" TEXT,
                            ADD COLUMN "prepared_at" TIMESTAMP(3),
                            ADD COLUMN "artifact_expires_at" TIMESTAMP(3),
                            ADD COLUMN "approved_by_id" TEXT,
                            ADD COLUMN "approved_at" TIMESTAMP(3),
                            ADD COLUMN "download_issued_at" TIMESTAMP(3),
                            ADD COLUMN "download_expires_at" TIMESTAMP(3),
                            ADD COLUMN "downloaded_at" TIMESTAMP(3);

ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security (same policy shape as the v2 tenancy migration)
-- ---------------------------------------------------------------------------
ALTER TABLE "care_team_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_team_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "dsar_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dsar_artifacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON care_team_memberships FOR ALL TO medical_app
    USING (clinic_id = current_setting('app.current_clinic_id', true))
    WITH CHECK (clinic_id = current_setting('app.current_clinic_id', true));

CREATE POLICY tenant_isolation ON dsar_artifacts FOR ALL TO medical_app
    USING (clinic_id = current_setting('app.current_clinic_id', true))
    WITH CHECK (clinic_id = current_setting('app.current_clinic_id', true));

-- ---------------------------------------------------------------------------
-- Backfill: primary doctors keep treating their patients.
-- Runs as the migration role (table owner), which bypasses RLS by design;
-- the created rows are ordinary tenant rows afterwards.
-- ---------------------------------------------------------------------------
INSERT INTO "care_team_memberships" ("id", "clinic_id", "patient_id", "user_id", "member_role", "started_at")
SELECT gen_random_uuid()::text,
       p."clinic_id",
       p."id",
       p."primary_doctor_id",
       'CARING_DOCTOR',
       CURRENT_TIMESTAMP
FROM "patients" p
WHERE p."primary_doctor_id" IS NOT NULL
ON CONFLICT DO NOTHING;
