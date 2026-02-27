-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Database Schema v1 (Fixed)
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'therapist'
    CHECK (role IN ('admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller', 'apn', 'intern')),
  is_active BOOLEAN DEFAULT true,
  clinical_supervisor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Therapists Table (from TherapyNotes data) ───────────────────
CREATE TABLE IF NOT EXISTS therapists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  user_id UUID REFERENCES users(id),
  is_apn BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Transactions Table (TherapyNotes billing data) ──────────────
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_type TEXT,
  patient_name TEXT,
  provider_name TEXT,
  service_date DATE,
  amount NUMERIC(12,2) DEFAULT 0,
  payer TEXT,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_txn_provider ON transactions(provider_name);
CREATE INDEX IF NOT EXISTS idx_txn_patient ON transactions(patient_name);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(service_date);
CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(record_type);

-- ─── Invoices Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  therapist_id UUID NOT NULL REFERENCES users(id),
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  hours_iic NUMERIC(6,2) DEFAULT 0,
  hours_op NUMERIC(6,2) DEFAULT 0,
  hours_sbys NUMERIC(6,2) DEFAULT 0,
  hours_ado NUMERIC(6,2) DEFAULT 0,
  hours_sick NUMERIC(6,2) DEFAULT 0,
  hours_pto NUMERIC(6,2) DEFAULT 0,
  hours_apn NUMERIC(6,2) DEFAULT 0,
  total_hours NUMERIC(6,2) DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  rejection_reason TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_therapist ON invoices(therapist_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON invoices(status);

-- ─── PTO Balances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pto_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  pto_hours NUMERIC(8,2) DEFAULT 0,
  sick_hours NUMERIC(8,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Upload Metadata ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upload_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT,
  uploaded_by UUID REFERENCES users(id),
  transactions_count INTEGER,
  therapist_count INTEGER,
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- Triggers (Create functions first)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pto_updated_at
  BEFORE UPDATE ON pto_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security (After all tables are created)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_metadata ENABLE ROW LEVEL SECURITY;

-- ─── Users RLS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS users_admin_all ON users;
DROP POLICY IF EXISTS users_self_read ON users;
DROP POLICY IF EXISTS users_supervisor_read ON users;

CREATE POLICY users_admin_all ON users
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY users_supervisor_read ON users
  FOR SELECT
  USING (
    clinical_supervisor_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

-- ─── Therapists RLS ─────────────────────────────────────────────
DROP POLICY IF EXISTS therapists_read_all ON therapists;
DROP POLICY IF EXISTS therapists_admin_write ON therapists;

CREATE POLICY therapists_read_all ON therapists
  FOR SELECT
  USING (true);

CREATE POLICY therapists_admin_write ON therapists
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- ─── Transactions RLS ───────────────────────────────────────────
DROP POLICY IF EXISTS txn_admin_all ON transactions;
DROP POLICY IF EXISTS txn_read_own ON transactions;
DROP POLICY IF EXISTS txn_leader_read ON transactions;

CREATE POLICY txn_admin_all ON transactions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY txn_read_own ON transactions
  FOR SELECT
  USING (
    provider_name = (
      SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY txn_leader_read ON transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'clinical_leader'
    )
  );

-- ─── Invoices RLS ───────────────────────────────────────────────
DROP POLICY IF EXISTS inv_admin_all ON invoices;
DROP POLICY IF EXISTS inv_own_read ON invoices;
DROP POLICY IF EXISTS inv_own_insert ON invoices;

CREATE POLICY inv_admin_all ON invoices
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY inv_own_read ON invoices
  FOR SELECT
  USING (
    therapist_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY inv_own_insert ON invoices
  FOR INSERT
  WITH CHECK (
    therapist_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── PTO Balances RLS ───────────────────────────────────────────
DROP POLICY IF EXISTS pto_admin_all ON pto_balances;
DROP POLICY IF EXISTS pto_own_read ON pto_balances;

CREATE POLICY pto_admin_all ON pto_balances
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY pto_own_read ON pto_balances
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── Upload Metadata RLS ────────────────────────────────────────
DROP POLICY IF EXISTS upload_admin_all ON upload_metadata;
DROP POLICY IF EXISTS upload_read_all ON upload_metadata;

CREATE POLICY upload_admin_all ON upload_metadata
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY upload_read_all ON upload_metadata
  FOR SELECT
  USING (true);