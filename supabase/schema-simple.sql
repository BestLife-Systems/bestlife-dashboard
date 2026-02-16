-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Database Schema v1 (Simple - Tables Only First)
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS upload_metadata CASCADE;
DROP TABLE IF EXISTS pto_balances CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS therapists CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ─── Users Table ──────────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'therapist'
    CHECK (role IN ('admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller')),
  is_active BOOLEAN DEFAULT true,
  clinical_supervisor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Therapists Table (from TherapyNotes data) ───────────────────
CREATE TABLE therapists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  user_id UUID REFERENCES users(id),
  is_apn BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Transactions Table (TherapyNotes billing data) ──────────────
CREATE TABLE transactions (
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

-- ─── Invoices Table ──────────────────────────────────────────────
CREATE TABLE invoices (
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

-- ─── PTO Balances ────────────────────────────────────────────────
CREATE TABLE pto_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  pto_hours NUMERIC(8,2) DEFAULT 0,
  sick_hours NUMERIC(8,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Upload Metadata ─────────────────────────────────────────────
CREATE TABLE upload_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT,
  uploaded_by UUID REFERENCES users(id),
  transactions_count INTEGER,
  therapist_count INTEGER,
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_txn_provider ON transactions(provider_name);
CREATE INDEX idx_txn_patient ON transactions(patient_name);
CREATE INDEX idx_txn_date ON transactions(service_date);
CREATE INDEX idx_txn_type ON transactions(record_type);
CREATE INDEX idx_inv_therapist ON invoices(therapist_id);
CREATE INDEX idx_inv_status ON invoices(status);

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pto_updated_at
  BEFORE UPDATE ON pto_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();