-- Amendment lifecycle (CLIN-002)
--
-- One open amendment draft per source note. The index is partial: once the
-- amendment is signed it leaves DRAFT status and a further amendment of the
-- (now AMENDED) source note is allowed. Concurrent amend() calls on the same
-- note race through this index; the loser gets a clean CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS "encounters_one_open_amendment_idx"
  ON "encounters" ("amended_from_id")
  WHERE "status" = 'DRAFT' AND "amended_from_id" IS NOT NULL;
