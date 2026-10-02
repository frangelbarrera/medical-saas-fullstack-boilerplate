-- Prompt lifecycle with dual control (AI-003)
--
-- Prompt versions become immutable state-machine objects:
--   DRAFT -> PENDING_APPROVAL -> ACTIVE -> RETIRED
-- The author submits; a DIFFERENT administrator approves. Activation
-- retires the previous ACTIVE version. Existing rows map onto the new
-- states through the legacy isActive flag.
CREATE TYPE "PromptState" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED');

ALTER TABLE "prompt_templates" ADD COLUMN "state" "PromptState" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "prompt_templates" ADD COLUMN "submitted_by_id" TEXT;
ALTER TABLE "prompt_templates" ADD COLUMN "approved_by_id" TEXT;
ALTER TABLE "prompt_templates" ADD COLUMN "approved_at" TIMESTAMP(3);

UPDATE "prompt_templates" SET "state" = CASE WHEN "is_active" THEN 'ACTIVE'::"PromptState" ELSE 'RETIRED'::"PromptState" END;

DROP INDEX IF EXISTS "prompt_templates_clinic_id_name_is_active_idx";
CREATE INDEX "prompt_templates_clinic_id_name_state_idx" ON "prompt_templates"("clinic_id", "name", "state");
