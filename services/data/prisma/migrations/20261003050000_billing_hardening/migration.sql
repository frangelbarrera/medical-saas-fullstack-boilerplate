-- Billing hardening (BIL-001 / BIL-002)
--
-- 1. Webhook events stop storing raw provider payloads: minimal metadata
--    (hash + size) only, and uniqueness moves to (provider, external_id)
--    so two providers may legitimately reuse an external id.
-- 2. A per-clinic invoice counter replaces MAX()+1 numbering; the unique
--    (clinic_id, number) index on invoices already exists and stays the
--    final backstop.
ALTER TABLE "webhook_events" ADD COLUMN "payload_hash" TEXT;
ALTER TABLE "webhook_events" ADD COLUMN "size_bytes" INTEGER;

-- Backfill hashes for legacy rows, then drop the raw payloads.
UPDATE "webhook_events" SET "payload_hash" = encode(sha256(convert_to("payload"::text, 'UTF8')), 'hex'), "size_bytes" = length("payload"::text) WHERE "payload" IS NOT NULL;

ALTER TABLE "webhook_events" ALTER COLUMN "payload" DROP NOT NULL;
-- The legacy uniqueness was created as a unique INDEX, not a constraint.
DROP INDEX IF EXISTS "webhook_events_external_id_key";
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_provider_external_id_key" UNIQUE ("provider", "external_id");

CREATE TABLE "invoice_counters" (
  "clinic_id" TEXT NOT NULL,
  "last_number" INTEGER NOT NULL,
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("clinic_id")
);
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "invoice_counters" ("clinic_id", "last_number")
SELECT "clinic_id", COALESCE(MAX(NULLIF(regexp_replace("number", '\D', '', 'g'), '')::bigint), 0)
FROM "invoices" WHERE "number" ~ '^INV-[0-9]+$' GROUP BY "clinic_id"
ON CONFLICT ("clinic_id") DO NOTHING;
