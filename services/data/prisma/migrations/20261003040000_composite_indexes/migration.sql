-- Composite indexes for the real query paths (PERF-001)
--
-- Every index mirrors an actual access pattern: agenda windows per doctor,
-- message lists per thread, invoice lists per patient and the audit cursor
-- walk. All of them are tenant-leading so row-level security stays the
-- first filter.
CREATE INDEX IF NOT EXISTS "appointments_clinic_doctor_start_end_idx"
  ON "appointments" ("clinic_id", "doctor_id", "start_time", "end_time");

CREATE INDEX IF NOT EXISTS "messages_thread_created_idx"
  ON "messages" ("thread_id", "created_at");

CREATE INDEX IF NOT EXISTS "invoices_clinic_patient_created_idx"
  ON "invoices" ("clinic_id", "patient_id", "created_at");

CREATE INDEX IF NOT EXISTS "observations_clinic_patient_effective_idx"
  ON "observations" ("clinic_id", "patient_id", "effective_at");

CREATE INDEX IF NOT EXISTS "audit_logs_clinic_seq_idx"
  ON "audit_logs" ("clinic_id", "seq");
