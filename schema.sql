-- Medical SaaS Boilerplate - Multi-Tenant Database Schema
-- Architecture: PostgreSQL with Row-Level Security (RLS)
-- Security: UUID v4, Audit Trail, RBAC

-- Enable extension for UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CLINICS TABLE (TENANTS)
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id CHAR(13) UNIQUE NOT NULL, -- National Business ID (e.g. RUC)
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS TABLE (RBAC)
CREATE TYPE user_role AS ENUM ('ADMIN', 'DOCTOR', 'RECEPTION');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. PATIENTS TABLE
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    identification_number VARCHAR(20) NOT NULL, -- National ID Number
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    gender VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(255),
    extra_data JSONB DEFAULT '{}', -- Emergency contacts, allergies, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, identification_number)
);

-- 4. APPOINTMENTS
CREATE TYPE appointment_status AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NOSHOW');

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status DEFAULT 'SCHEDULED',
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_times CHECK (end_time > start_time)
);

-- 5. ELECTRONIC HEALTH RECORDS (EHR)
CREATE TABLE medical_histories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    doctor_id UUID NOT NULL REFERENCES users(id),
    evolution TEXT NOT NULL,
    icd10_diagnosis VARCHAR(10) NOT NULL,
    vital_signs JSONB NOT NULL, -- {blood_pressure: "120/80", weight: 70, etc}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PRESCRIPTIONS
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    history_id UUID NOT NULL REFERENCES medical_histories(id),
    medications JSONB NOT NULL, -- Array of objects [{name, dose, frequency}]
    extra_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. FORENSIC AUDIT (Immutable)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
    affected_table VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    previous_data JSONB,
    new_data JSONB,
    source_ip INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Revoke delete and update on audit logs for maximum security
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- 8. ICD-10 CATALOG (Full Text Search)
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
ALTER TABLE medical_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- General Policy: User can only see data from their clinic
-- Assumes the backend sets 'app.current_clinic_id' in the session
CREATE POLICY clinic_isolation_policy ON users
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON patients
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON appointments
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON medical_histories
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON prescriptions
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

CREATE POLICY clinic_isolation_policy ON audit_logs
    USING (clinic_id = (current_setting('app.current_clinic_id')::UUID));

-- Indexes for multi-tenant search optimization
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_appointments_date ON appointments(start_time);
CREATE INDEX idx_medical_history_patient ON medical_histories(patient_id);
