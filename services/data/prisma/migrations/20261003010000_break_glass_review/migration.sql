-- Break-glass abuse controls (BG-001)
--
-- Emergency access becomes a reviewed, revocable object. The full
-- justification stays inside this protected row; general audit events keep
-- only the reason length, and the review trail names the reviewer.
ALTER TABLE "break_glass_accesses" ADD COLUMN "reviewed_by_id" TEXT;
ALTER TABLE "break_glass_accesses" ADD COLUMN "reviewed_at" TIMESTAMP(3);

ALTER TABLE "break_glass_accesses" ADD CONSTRAINT "break_glass_accesses_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "break_glass_accesses_clinic_id_reviewed_at_idx" ON "break_glass_accesses"("clinic_id", "reviewed_at");
