-- Medical SaaS Boilerplate - Multi-Tenant Database Schema
-- Architecture: PostgreSQL with Row-Level Security (RLS)
-- Security: UUID v4, Audit Trail, RBAC, AES-256-GCM app-layer encryption
--
-- IMPORTANT: This schema is the production target. The current server.ts uses
-- in-memory mock arrays for development portability. To switch to PostgreSQL,
-- run `psql -f schema.sql` against your database and update server.ts to use
-- the pool.query() calls instead of the mock arrays.
--
-- NOTE on column types: PHI columns (identification_number, phone, email,
-- birth_date) store AES-256-GCM ciphertext in the format 'iv:authTag:ciphertext'
-- (hex encoded). This produces strings of ~80-120 hex characters, so the
-- columns are typed TEXT (not VARCHAR(20) as in the previous version, which
-- would truncate ciphertext and silently corrupt data).

-- Enable extension for UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CLINICS TABLE (TENANTS)
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id CHAR(13) UNIQUE NOT NULL, -- National Business ID (e.g. RUC)
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    address TEXT,
    phone TEXT,
    email TEXT,
    logo TEXT,
    owner_id UUID, -- FK to users(id), nullable for bootstrapping
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS TABLE (RBAC)
CREATE TYPE user_role AS ENUM ('ADMIN', 'DOCTOR', 'SECRETARY');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- bcrypt hash
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    managed_doctor_ids JSONB DEFAULT '[]', -- for SECRETARY role: which doctors they assist
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Link clinics.owner_id back to users (after users table is created)
ALTER TABLE clinics
    ADD CONSTRAINT clinics_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- 3. PATIENTS TABLE
-- NOTE: identification_number, phone, email, birth_date store AES-256-GCM
-- ciphertext (format: 'iv:authTag:ciphertext' hex, ~80-120 chars).
-- They are typed TEXT to avoid truncation.
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    identification_number TEXT NOT NULL, -- AES-256-GCM ciphertext (was VARCHAR(20))
    name VARCHAR(255) NOT NULL, -- not encrypted: needed for search/list
    birth_date TEXT, -- AES-256-GCM ciphertext (was DATE)
    gender VARCHAR(20),
    phone TEXT, -- AES-256-GCM ciphertext (was VARCHAR(20))
    email TEXT, -- AES-256-GCM ciphertext (was VARCHAR(255))
    status VARCHAR(50) DEFAULT 'Active',
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    extra_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, identification_number)
);

-- 4. APPOINTMENTS
CREATE TYPE appointment_status AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NOSHOW');

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status appointment_status DEFAULT 'SCHEDULED',
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_times CHECK (end_time > start_time)
);

-- 5. ELECTRONIC HEALTH RECORDS (EHR) / CONSULTATIONS
CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    evolution TEXT,
    vital_signs JSONB, -- {bp: "120/80", hr: "72", temp: "36.5", weight: "70", o2: "98"}
    diagnosis_cie10 JSONB, -- array of ICD-10 codes
    prescription JSONB, -- array of {medication, dose, frequency, duration}
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. INVOICES
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    concept TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Cancelled', 'Refunded')),
    insurance_company VARCHAR(255),
    date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. EXPENSES
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    concept TEXT NOT NULL,
    category VARCHAR(100),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    registered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. AI CHATS (per-user, per-clinic)
CREATE TABLE ai_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. FORENSIC AUDIT LOG (Immutable, tamper-evident hash chain)
-- This table is append-only: REVOKE UPDATE and DELETE from all roles.
-- Each row's hash field is SHA-256(prev_hash || JSON.stringify(row_data)).
-- Verification: walk the chain and recompute hashes; any tampering breaks the chain.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255), -- denormalized for forensic readability after user deletion
    action VARCHAR(100) NOT NULL, -- e.g. PATIENT_CREATE, USER_DELETE, PAYMENT_RECEIVED
    target VARCHAR(255), -- resource ID affected
    type VARCHAR(50), -- PHI, SECURITY, FINANCE, SCHEDULE
    details JSONB DEFAULT '{}',
    source_ip INET,
    user_agent TEXT,
    prev_hash CHAR(64), -- SHA-256 of the previous log entry
    hash CHAR(64) NOT NULL, -- SHA-256 of (prev_hash || this_entry_data)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs are append-only. No role (including admin) can UPDATE or DELETE.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- 10. ICD-10 CATALOG (Full Text Search)
CREATE TABLE icd10_catalog (
    code VARCHAR(10) PRIMARY KEY,
    description TEXT NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', description)) STORED
);

CREATE INDEX idx_icd10_fts ON icd10_catalog USING GIN(search_vector);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ==========================================

-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- General Policy: User can only see data from their clinic.
-- Assumes the backend sets 'app.current_clinic_id' on each connection:
--   SET app.current_clinic_id = '<clinic_uuid>';
--
-- IMPORTANT: WITH CHECK is required so that INSERT/UPDATE operations are also
-- subject to RLS. Without WITH CHECK, a user could INSERT a row with a
-- different clinic_id, bypassing isolation.

CREATE POLICY clinic_isolation_policy ON users
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON patients
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON appointments
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON consultations
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON invoices
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON expenses
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON ai_chats
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON audit_logs
    FOR ALL
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID))
    WITH CHECK (clinic_id = (current_setting('app.current_clinic_id')::UUID));

-- Force RLS even for table owners (defense in depth)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE consultations FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_chats FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ==========================================
-- INDEXES for multi-tenant query performance
-- ==========================================

-- Every query filters by clinic_id first; index it on all tables
CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_consultations_clinic ON consultations(clinic_id);
CREATE INDEX idx_invoices_clinic ON invoices(clinic_id);
CREATE INDEX idx_expenses_clinic ON expenses(clinic_id);
CREATE INDEX idx_ai_chats_clinic_user ON ai_chats(clinic_id, user_id);
CREATE INDEX idx_audit_logs_clinic_created ON audit_logs(clinic_id, created_at DESC);

-- Foreign key indexes for JOIN performance
CREATE INDEX idx_patients_doctor ON patients(doctor_id);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_doctor ON consultations(doctor_id);
CREATE INDEX idx_invoices_patient ON invoices(patient_id);

-- ==========================================
-- TRIGGERS for updated_at maintenance
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_chats_updated_at BEFORE UPDATE ON ai_chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
