-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Row Level Security Policies
-- Run this AFTER the main schema
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pto_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_metadata ENABLE ROW LEVEL SECURITY;

-- ─── Users RLS ───────────────────────────────────────────────────
-- Drop existing policies if they exist
DROP POLICY IF EXISTS users_admin_all ON users;
DROP POLICY IF EXISTS users_self_read ON users;
DROP POLICY IF EXISTS users_supervisor_read ON users;

-- Admins can see and modify all users
CREATE POLICY users_admin_all ON users
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Users can see themselves
CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (auth_id = auth.uid());

-- Clinical leaders can see their supervisees
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

-- Everyone can read therapists (for dropdowns, etc.)
CREATE POLICY therapists_read_all ON therapists
  FOR SELECT
  USING (true);

-- Only admins can modify therapists
CREATE POLICY therapists_admin_write ON therapists
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- ─── Transactions RLS ───────────────────────────────────────────
DROP POLICY IF EXISTS txn_admin_all ON transactions;
DROP POLICY IF EXISTS txn_read_own ON transactions;
DROP POLICY IF EXISTS txn_leader_read ON transactions;

-- Admins can see and modify all transactions
CREATE POLICY txn_admin_all ON transactions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Therapists can see their own transactions
CREATE POLICY txn_read_own ON transactions
  FOR SELECT
  USING (
    provider_name = (
      SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- Clinical leaders can see all transactions
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

-- Admins can see and modify all invoices
CREATE POLICY inv_admin_all ON invoices
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Users can see their own invoices
CREATE POLICY inv_own_read ON invoices
  FOR SELECT
  USING (
    therapist_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Users can create their own invoices
CREATE POLICY inv_own_insert ON invoices
  FOR INSERT
  WITH CHECK (
    therapist_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── PTO Balances RLS ───────────────────────────────────────────
DROP POLICY IF EXISTS pto_admin_all ON pto_balances;
DROP POLICY IF EXISTS pto_own_read ON pto_balances;

-- Admins can see and modify all PTO balances
CREATE POLICY pto_admin_all ON pto_balances
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Users can see their own PTO balance
CREATE POLICY pto_own_read ON pto_balances
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── Upload Metadata RLS ────────────────────────────────────────
DROP POLICY IF EXISTS upload_admin_all ON upload_metadata;
DROP POLICY IF EXISTS upload_read_all ON upload_metadata;

-- Admins can see and modify all upload metadata
CREATE POLICY upload_admin_all ON upload_metadata
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Everyone can read upload metadata (for showing data ranges, etc.)
CREATE POLICY upload_read_all ON upload_metadata
  FOR SELECT
  USING (true);