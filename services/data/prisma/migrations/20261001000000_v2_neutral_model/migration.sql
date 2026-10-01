-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PatientIdentifierType" AS ENUM ('INTERNAL', 'PASSPORT', 'NATIONAL_ID', 'INSURANCE');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('NEW_PATIENT', 'FOLLOW_UP', 'ANNUAL_CHECKUP', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SIGNED', 'AMENDED');

-- CreateEnum
CREATE TYPE "CodingSystem" AS ENUM ('ICD_10', 'SNOMED_CT', 'LOINC');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "AllergyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'NO_KNOWN');

-- CreateEnum
CREATE TYPE "MedicationOrderStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PROCESSED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ThreadCategory" AS ENUM ('PATIENT', 'CARE_TEAM', 'INTERNAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DsarType" AS ENUM ('ACCESS', 'EXPORT', 'RECTIFICATION', 'OBJECTION', 'RESTRICTION');

-- CreateEnum
CREATE TYPE "DsarStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TREATMENT', 'DATA_SHARING', 'AI_PROCESSING', 'COMMUNICATION');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REFUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AiDraftType" AS ENUM ('SCRIBE_NOTE', 'CHAT_REPLY');

-- CreateEnum
CREATE TYPE "AiReviewState" AS ENUM ('PENDING', 'INSERTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('PULSE', 'TEMPERATURE', 'BP_SYSTOLIC', 'BP_DIASTOLIC', 'WEIGHT', 'HEIGHT', 'BMI', 'CUSTOM');

-- AlterEnum
BEGIN;
CREATE TYPE "AppointmentStatus_new" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED');
ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "AppointmentStatus_new" USING (CASE "status"::text WHEN 'ACTIVE' THEN 'IN_PROGRESS' WHEN 'NOSHOW' THEN 'NO_SHOW' ELSE "status"::text END::"AppointmentStatus_new");
ALTER TYPE "AppointmentStatus" RENAME TO "AppointmentStatus_old";
ALTER TYPE "AppointmentStatus_new" RENAME TO "AppointmentStatus";
DROP TYPE "AppointmentStatus_old";
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoices" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING (CASE "status"::text WHEN 'PENDING' THEN 'ISSUED' WHEN 'REFUNDED' THEN 'CANCELLED' ELSE "status"::text END::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PATIENT';

-- DropForeignKey
ALTER TABLE "ai_chats" DROP CONSTRAINT "ai_chats_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_chats" DROP CONSTRAINT "ai_chats_user_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_registered_by_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_doctor_id_fkey";

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT "patients_doctor_id_fkey";

-- DropIndex
DROP INDEX "appointments_clinic_id_idx";

-- DropIndex
DROP INDEX "appointments_doctor_id_idx";

-- DropIndex
DROP INDEX "appointments_start_time_idx";

-- DropIndex
DROP INDEX "clinics_tax_id_key";

-- DropIndex
DROP INDEX "expenses_clinic_id_idx";

-- DropIndex
DROP INDEX "invoices_clinic_id_idx";

-- DropIndex
DROP INDEX "invoices_patient_id_idx";

-- DropIndex
DROP INDEX "patients_clinic_id_identification_number_key";

-- DropIndex
DROP INDEX "patients_doctor_id_idx";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "type" "AppointmentType" NOT NULL DEFAULT 'FOLLOW_UP',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "appointments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable (audit: preserve actor identity, map legacy category, mark legacy rows)
ALTER TABLE "audit_logs"
ADD COLUMN     "actor_id" TEXT,
ADD COLUMN     "actor_role" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "seq" SERIAL NOT NULL,
ADD COLUMN     "source_ip_hash" TEXT,
ADD COLUMN     "subject_patient_id" TEXT;

UPDATE "audit_logs" SET "actor_id" = "user_id" WHERE "user_id" IS NOT NULL;
UPDATE "audit_logs" SET "category" = CASE
  WHEN upper("type") = 'PHI' THEN 'PHI'
  WHEN upper("type") = 'AUTH' THEN 'AUTH'
  WHEN upper("type") = 'CLINICAL' THEN 'CLINICAL'
  WHEN upper("type") = 'BILLING' THEN 'BILLING'
  WHEN upper("type") = 'AI' THEN 'AI'
  WHEN upper("type") = 'ADMIN' THEN 'ADMIN'
  WHEN upper("type") = 'EXPORT' THEN 'EXPORT'
  ELSE 'SYSTEM' END;
-- Mark pre-migration rows: their hashes belong to the legacy global chain and
-- are excluded from per-clinic chain recomputation (see services/audit).
UPDATE "audit_logs" SET "details" = COALESCE("details", '{}'::jsonb) || '{"legacy": true}'::jsonb;

ALTER TABLE "audit_logs"
DROP COLUMN "source_ip",
DROP COLUMN "type",
DROP COLUMN "user_agent",
DROP COLUMN "user_id",
DROP COLUMN "user_name";

-- AlterTable
ALTER TABLE "clinics" DROP COLUMN "logo",
DROP COLUMN "tax_id",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CHF',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-CH',
ADD COLUMN     "retention_years" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Zurich';

-- AlterTable (expenses: rename legacy columns, preserve data)
ALTER TABLE "expenses" RENAME COLUMN "concept" TO "description";
ALTER TABLE "expenses" RENAME COLUMN "date" TO "incurred_at";
ALTER TABLE "expenses" RENAME COLUMN "registered_by" TO "recorded_by_id";
UPDATE "expenses" SET "category" = 'GENERAL' WHERE "category" IS NULL;
ALTER TABLE "expenses"
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CHF',
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable (invoices part 1: rename and nullable additions; fills run after
-- invoice_items exists - see part 2 at the end of this migration)
ALTER TABLE "invoices" RENAME COLUMN "date" TO "issued_at";
ALTER TABLE "invoices"
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CHF',
ADD COLUMN     "due_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "payer_id" TEXT,
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(12,2),
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable (patients part 1: renames and nullable additions; fills run in
-- part 2 once patient_identifiers exists)
ALTER TABLE "patients" RENAME COLUMN "name" TO "full_name";
ALTER TABLE "patients" RENAME COLUMN "gender" TO "sex";
ALTER TABLE "patients"
ADD COLUMN     "address_enc" TEXT,
ADD COLUMN     "birth_date_enc" TEXT,
ADD COLUMN     "birth_year" INTEGER,
ADD COLUMN     "default_payer_id" TEXT,
ADD COLUMN     "email_enc" TEXT,
ADD COLUMN     "email_hmac" TEXT,
ADD COLUMN     "internal_ref" TEXT,
ADD COLUMN     "phone_enc" TEXT,
ADD COLUMN     "phone_hmac" TEXT,
ADD COLUMN     "primary_doctor_id" TEXT;

-- AlterTable (users: portal identity link; managed_doctor_ids removed -
-- secretaries operate at clinic scope under the new capability model)
ALTER TABLE "users" DROP COLUMN "managed_doctor_ids",
ADD COLUMN     "patient_id" TEXT;

-- CreateTable
CREATE TABLE "patient_identifiers" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "PatientIdentifierType" NOT NULL,
    "value_enc" TEXT NOT NULL,
    "value_hmac" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_consents" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "granted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "note" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payers" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INSURANCE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "title" TEXT NOT NULL,
    "chief_complaint" TEXT,
    "observations" TEXT,
    "plan" TEXT,
    "status" "EncounterStatus" NOT NULL DEFAULT 'DRAFT',
    "signed_at" TIMESTAMP(3),
    "signed_by_id" TEXT,
    "amended_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_versions" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "encounter_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "author_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "type" "ObservationType" NOT NULL,
    "loinc_code" TEXT,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "coding_system" "CodingSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'ACTIVE',
    "onset_date" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "category" TEXT,
    "reaction" TEXT,
    "severity" "AllergySeverity",
    "status" "AllergyStatus" NOT NULL DEFAULT 'ACTIVE',
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_orders" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "medication_name" TEXT NOT NULL,
    "dose" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "duration_days" INTEGER,
    "instructions" TEXT,
    "status" "MedicationOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "authored_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_glass_accesses" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "break_glass_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "ThreadCategory" NOT NULL DEFAULT 'INTERNAL',
    "patient_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_participants" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CHF',
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "device_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsar_requests" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "type" "DsarType" NOT NULL,
    "status" "DsarStatus" NOT NULL DEFAULT 'OPEN',
    "details" TEXT,
    "due_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dsar_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "redaction_applied" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "encounter_id" TEXT,
    "patient_id" TEXT,
    "author_id" TEXT NOT NULL,
    "type" "AiDraftType" NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "review_state" "AiReviewState" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_identifiers_patient_id_idx" ON "patient_identifiers"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identifiers_clinic_id_type_value_hmac_key" ON "patient_identifiers"("clinic_id", "type", "value_hmac");

-- CreateIndex
CREATE INDEX "patient_consents_clinic_id_idx" ON "patient_consents"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_consents_patient_id_type_key" ON "patient_consents"("patient_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "payers_clinic_id_name_key" ON "payers"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "availability_rules_clinic_id_doctor_id_idx" ON "availability_rules"("clinic_id", "doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_appointment_id_key" ON "encounters"("appointment_id");

-- CreateIndex
CREATE INDEX "encounters_clinic_id_patient_id_idx" ON "encounters"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "encounters_doctor_id_idx" ON "encounters"("doctor_id");

-- CreateIndex
CREATE INDEX "encounter_versions_clinic_id_idx" ON "encounter_versions"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "encounter_versions_encounter_id_version_key" ON "encounter_versions"("encounter_id", "version");

-- CreateIndex
CREATE INDEX "observations_clinic_id_patient_id_idx" ON "observations"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "problems_clinic_id_patient_id_idx" ON "problems"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "problems_code_idx" ON "problems"("code");

-- CreateIndex
CREATE INDEX "allergies_clinic_id_patient_id_idx" ON "allergies"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "medication_orders_clinic_id_patient_id_idx" ON "medication_orders"("clinic_id", "patient_id");

-- CreateIndex
CREATE INDEX "break_glass_accesses_clinic_id_actor_id_expires_at_idx" ON "break_glass_accesses"("clinic_id", "actor_id", "expires_at");

-- CreateIndex
CREATE INDEX "threads_clinic_id_last_message_at_idx" ON "threads"("clinic_id", "last_message_at");

-- CreateIndex
CREATE INDEX "thread_participants_clinic_id_user_id_idx" ON "thread_participants"("clinic_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_participants_thread_id_user_id_key" ON "thread_participants"("thread_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_clinic_id_user_id_read_at_idx" ON "notifications"("clinic_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_clinic_id_invoice_id_idx" ON "payments"("clinic_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_external_id_key" ON "webhook_events"("external_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_received_at_idx" ON "webhook_events"("provider", "received_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "dsar_requests_clinic_id_status_idx" ON "dsar_requests"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "ai_conversations_clinic_id_user_id_idx" ON "ai_conversations"("clinic_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_drafts_clinic_id_review_state_idx" ON "ai_drafts"("clinic_id", "review_state");

-- CreateIndex
CREATE INDEX "prompt_templates_clinic_id_name_is_active_idx" ON "prompt_templates"("clinic_id", "name", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_name_version_key" ON "prompt_templates"("name", "version");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_start_time_idx" ON "appointments"("clinic_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_start_time_idx" ON "appointments"("doctor_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- CreateIndex
CREATE INDEX "audit_logs_clinic_id_action_idx" ON "audit_logs"("clinic_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_subject_patient_id_idx" ON "audit_logs"("subject_patient_id");

-- CreateIndex
CREATE INDEX "expenses_clinic_id_incurred_at_idx" ON "expenses"("clinic_id", "incurred_at");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_patient_id_idx" ON "invoices"("clinic_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_clinic_id_number_key" ON "invoices"("clinic_id", "number");

-- CreateIndex
CREATE INDEX "patients_clinic_id_full_name_idx" ON "patients"("clinic_id", "full_name");

-- CreateIndex
CREATE INDEX "patients_primary_doctor_id_idx" ON "patients"("primary_doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinic_id_internal_ref_key" ON "patients"("clinic_id", "internal_ref");

-- CreateIndex
CREATE UNIQUE INDEX "users_patient_id_key" ON "users"("patient_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_primary_doctor_id_fkey" FOREIGN KEY ("primary_doctor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_default_payer_id_fkey" FOREIGN KEY ("default_payer_id") REFERENCES "payers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_identifiers" ADD CONSTRAINT "patient_identifiers_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payers" ADD CONSTRAINT "payers_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_versions" ADD CONSTRAINT "encounter_versions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_versions" ADD CONSTRAINT "encounter_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_authored_by_id_fkey" FOREIGN KEY ("authored_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_accesses" ADD CONSTRAINT "break_glass_accesses_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_accesses" ADD CONSTRAINT "break_glass_accesses_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_accesses" ADD CONSTRAINT "break_glass_accesses_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AlterTable (invoices part 2: backfill from legacy columns)
UPDATE "invoices" SET "number" = 'INV-' || upper(right("id", 8)) WHERE "number" IS NULL;
UPDATE "invoices" SET "subtotal" = "amount", "total" = "amount" WHERE "subtotal" IS NULL;

INSERT INTO "invoice_items" ("id", "clinic_id", "invoice_id", "description", "quantity", "unit_price", "total")
SELECT gen_random_uuid()::text, i."clinic_id", i."id", COALESCE(i."concept", 'Clinical services'), 1, i."amount", i."amount"
FROM "invoices" i
WHERE i."concept" IS NOT NULL AND i."amount" IS NOT NULL;

ALTER TABLE "invoices"
DROP COLUMN "amount",
DROP COLUMN "concept",
DROP COLUMN "doctor_id",
DROP COLUMN "insurance_company",
DROP COLUMN "payment_method";
ALTER TABLE "invoices" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "total" SET NOT NULL;

-- AlterTable (patients part 2: move PHI ciphertext, typed identifiers, refs)
-- Copy encrypted PHI into the new columns (ciphertext is moved as-is; the
-- HMAC search indexes are backfilled by `npm run db:backfill`, which needs
-- the application key and therefore cannot run inside a migration).
UPDATE "patients" SET "birth_date_enc" = "birth_date" WHERE "birth_date" IS NOT NULL;
UPDATE "patients" SET "phone_enc" = "phone" WHERE "phone" IS NOT NULL;
UPDATE "patients" SET "email_enc" = "email" WHERE "email" IS NOT NULL;
UPDATE "patients" SET "primary_doctor_id" = "doctor_id" WHERE "doctor_id" IS NOT NULL;

-- Typed identifiers: the legacy identification_number becomes the INTERNAL
-- identifier (ciphertext preserved).
INSERT INTO "patient_identifiers" ("id", "clinic_id", "patient_id", "type", "value_enc", "is_primary", "created_at")
SELECT gen_random_uuid()::text, "clinic_id", "id", 'INTERNAL', "identification_number", true, "created_at"
FROM "patients"
WHERE "identification_number" IS NOT NULL AND "identification_number" <> '';

-- Sequential internal reference per clinic (P-000001 style).
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "clinic_id" ORDER BY "created_at", "id") AS rn
  FROM "patients"
)
UPDATE "patients" SET "internal_ref" = 'P-' || lpad((SELECT rn FROM ranked WHERE ranked."id" = "patients"."id")::text, 6, '0')
WHERE "internal_ref" IS NULL;
ALTER TABLE "patients" ALTER COLUMN "internal_ref" SET NOT NULL;

-- Status: legacy free text -> typed enum.
ALTER TABLE "patients" ADD COLUMN "status_new" "PatientStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "patients" SET "status_new" = CASE
  WHEN lower("status") IN ('inactive', 'inactive ') THEN 'INACTIVE'::"PatientStatus"
  WHEN lower("status") = 'archived' THEN 'ARCHIVED'::"PatientStatus"
  ELSE 'ACTIVE'::"PatientStatus" END;
ALTER TABLE "patients" DROP COLUMN "status";
ALTER TABLE "patients" RENAME COLUMN "status_new" TO "status";

-- extra_data (free-form JSON) is intentionally dropped: typed columns and
-- child tables replace it. Birth year is backfilled by `npm run db:backfill`.
ALTER TABLE "patients"
DROP COLUMN "birth_date",
DROP COLUMN "doctor_id",
DROP COLUMN "email",
DROP COLUMN "extra_data",
DROP COLUMN "identification_number",
DROP COLUMN "phone";


-- DataMigration: legacy consultations -> encounters + normalized clinical rows

INSERT INTO "encounters" ("id", "clinic_id", "patient_id", "doctor_id", "appointment_id", "title", "chief_complaint", "observations", "plan", "status", "signed_at", "signed_by_id", "created_at", "updated_at")
SELECT c."id", c."clinic_id", c."patient_id", c."doctor_id", c."appointment_id",
       COALESCE(NULLIF(c."reason", ''), 'Consultation note'), NULLIF(c."reason", ''), c."evolution", NULL,
       'SIGNED', c."date", c."doctor_id", c."date", c."date"
FROM "consultations" c;

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'PULSE', '8867-4', c."vital_signs"->>'pulse', 'bpm', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'pulse' AND COALESCE(c."vital_signs"->>'pulse', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'TEMPERATURE', '8310-5', c."vital_signs"->>'temp', 'C', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'temp' AND COALESCE(c."vital_signs"->>'temp', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'BP_SYSTOLIC', '8480-6', c."vital_signs"->>'bpS', 'mmHg', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'bpS' AND COALESCE(c."vital_signs"->>'bpS', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'BP_DIASTOLIC', '8462-4', c."vital_signs"->>'bpD', 'mmHg', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'bpD' AND COALESCE(c."vital_signs"->>'bpD', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'WEIGHT', '29463-7', c."vital_signs"->>'weight', 'kg', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'weight' AND COALESCE(c."vital_signs"->>'weight', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'HEIGHT', '8302-2', c."vital_signs"->>'height', 'cm', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'height' AND COALESCE(c."vital_signs"->>'height', '') <> '';

INSERT INTO "observations" ("id", "clinic_id", "patient_id", "encounter_id", "type", "loinc_code", "value", "unit", "effective_at", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'CUSTOM', '59273-7', c."vital_signs"->>'saturation', '%', c."date", c."doctor_id", c."date"
FROM "consultations" c WHERE c."vital_signs" ? 'saturation' AND COALESCE(c."vital_signs"->>'saturation', '') <> '';

INSERT INTO "problems" ("id", "clinic_id", "patient_id", "encounter_id", "coding_system", "code", "display", "status", "onset_date", "recorded_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", 'ICD_10', d->>'code', COALESCE(NULLIF(d->>'description', ''), d->>'code'), 'ACTIVE', c."date", c."doctor_id", c."date"
FROM "consultations" c, jsonb_array_elements(COALESCE(c."diagnosis_cie10", '[]'::jsonb)) AS d
WHERE COALESCE(d->>'code', '') <> '';

INSERT INTO "medication_orders" ("id", "clinic_id", "patient_id", "encounter_id", "medication_name", "dose", "frequency", "duration_days", "status", "authored_by_id", "created_at")
SELECT gen_random_uuid()::text, c."clinic_id", c."patient_id", c."id", p->>'medication', NULLIF(p->>'dose', ''),
       NULLIF(p->>'frequency', ''),
       CASE WHEN regexp_replace(COALESCE(p->>'duration', ''), '\D', '', 'g') ~ '^[0-9]+$'
            THEN regexp_replace(p->>'duration', '\D', '', 'g')::int ELSE NULL END,
       'COMPLETED', c."doctor_id", c."date"
FROM "consultations" c, jsonb_array_elements(COALESCE(c."prescription", '[]'::jsonb)) AS p
WHERE COALESCE(p->>'medication', '') <> '';

INSERT INTO "encounter_versions" ("id", "clinic_id", "encounter_id", "version", "author_id", "snapshot", "change_reason", "created_at")
SELECT gen_random_uuid()::text, e."clinic_id", e."id", 1, e."doctor_id",
       jsonb_build_object('title', e."title", 'chiefComplaint', e."chief_complaint", 'observations', e."observations", 'plan', e."plan"),
       'Migrated from legacy consultation record', e."created_at"
FROM "encounters" e;

INSERT INTO "ai_conversations" ("id", "clinic_id", "user_id", "title", "created_at", "updated_at")
SELECT "id", "clinic_id", "user_id", "title", "created_at", "updated_at" FROM "ai_chats";

INSERT INTO "ai_messages" ("id", "clinic_id", "conversation_id", "role", "content", "created_at")
SELECT gen_random_uuid()::text, ac."clinic_id", ac."id",
       CASE COALESCE(m->>'role', 'user') WHEN 'assistant' THEN 'ASSISTANT' ELSE 'USER' END,
       COALESCE(m->>'content', ''), ac."created_at"
FROM "ai_chats" ac, jsonb_array_elements(COALESCE(ac."messages", '[]'::jsonb)) AS m
WHERE jsonb_typeof(ac."messages") = 'array';

-- DropTable (after data has been migrated)
DROP TABLE "consultations";

-- DropTable
DROP TABLE "ai_chats";
