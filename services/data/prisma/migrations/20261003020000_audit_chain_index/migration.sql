-- Audit chain continuity (AUD-001)
--
-- seq is a GLOBAL autoincrement shared by every clinic, so per-clinic
-- sequence adjacency cannot be verified directly. chain_index is a per-
-- clinic position inside the hash chain: continuity check requires the
-- indexes of one clinic to be exactly 0..N-1. Deleting a middle row leaves
-- a hole that a recomputed hash chain alone would hide.
ALTER TABLE "audit_logs" ADD COLUMN "chain_index" INTEGER NOT NULL DEFAULT 0;

-- Backfill: per-clinic insertion order matches the global seq order.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY clinic_id ORDER BY seq) - 1 AS idx
  FROM audit_logs
)
UPDATE audit_logs a SET chain_index = o.idx FROM ordered o WHERE a.id = o.id;

CREATE UNIQUE INDEX "audit_logs_clinic_id_chain_index_idx" ON "audit_logs"("clinic_id", "chain_index");
