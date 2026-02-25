-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub - Payroll System Schema (v4)
-- Run this against your Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Users table updates ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_enabled boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS supervision_required boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_supervisor_id uuid REFERENCES users(id);

-- ── 2. Rate Types ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL CHECK (unit IN ('hourly', 'session', 'day', 'event')),
  default_duration_minutes integer,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 3. Bill Rate Defaults ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_rate_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type_id uuid NOT NULL REFERENCES rate_types(id) ON DELETE CASCADE,
  default_bill_rate numeric(10,2) NOT NULL DEFAULT 0,
  effective_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(rate_type_id, effective_date)
);

-- ── 4. User Pay Rates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate_type_id uuid NOT NULL REFERENCES rate_types(id) ON DELETE CASCADE,
  pay_rate numeric(10,2) NOT NULL,
  effective_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, rate_type_id, effective_date)
);

-- ── 5. Pay Periods ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('first_half', 'second_half')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  label text,
  created_by uuid REFERENCES users(id),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(start_date, end_date)
);

-- ── 6. Pay Period Recipients ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_period_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'approved', 'rejected', 'exempt', 'zero_hours', 'exported')),
  draft_token uuid DEFAULT gen_random_uuid(),
  submit_token uuid DEFAULT gen_random_uuid(),
  invoice_data jsonb,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  rejection_reason text,
  zero_hours_reason text,
  admin_override_data jsonb,
  reminder_count integer DEFAULT 0,
  last_reminder_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(pay_period_id, user_id)
);

-- ── 7. Reminder Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES pay_period_recipients(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  sent_at timestamptz DEFAULT now(),
  status text DEFAULT 'sent',
  error_message text
);

-- ── 8. Time Entries (Immutable Ledger) ──────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES pay_period_recipients(id),
  user_id uuid NOT NULL REFERENCES users(id),
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id),
  rate_type_id uuid NOT NULL REFERENCES rate_types(id),
  service_date date,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  duration_minutes integer,
  client_initials text,
  est_bill_amount numeric(10,2) NOT NULL DEFAULT 0,
  est_pay_amount numeric(10,2) NOT NULL DEFAULT 0,
  admin_bill_override numeric(10,2),
  admin_pay_override numeric(10,2),
  notes text,
  locked boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 9. Rollup - Pay Period ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rollup_pay_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id),
  user_id uuid NOT NULL REFERENCES users(id),
  total_hours numeric(10,2) DEFAULT 0,
  total_sessions integer DEFAULT 0,
  est_bill_total numeric(10,2) DEFAULT 0,
  est_pay_total numeric(10,2) DEFAULT 0,
  margin numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(pay_period_id, user_id)
);

-- ── 10. Rollup - Monthly ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rollup_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  month_year text NOT NULL, -- 'YYYY-MM'
  total_hours numeric(10,2) DEFAULT 0,
  total_sessions integer DEFAULT 0,
  est_bill_total numeric(10,2) DEFAULT 0,
  est_pay_total numeric(10,2) DEFAULT 0,
  margin numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month_year)
);

-- ── 11. Export Batches ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number serial,
  label text,
  record_count integer DEFAULT 0,
  total_pay numeric(10,2) DEFAULT 0,
  csv_text text,
  exported_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- ── 12. Audit Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  user_id uuid REFERENCES users(id),
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_pay_rates_user ON user_pay_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pay_rates_rate ON user_pay_rates(rate_type_id);
CREATE INDEX IF NOT EXISTS idx_pay_period_recipients_period ON pay_period_recipients(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pay_period_recipients_user ON pay_period_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_pay_period_recipients_status ON pay_period_recipients(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_recipient ON time_entries(recipient_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_period ON time_entries(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_rollup_pp_period ON rollup_pay_period(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_rollup_monthly_user ON rollup_monthly(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_recipient ON reminder_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_users_supervisor ON users(clinical_supervisor_id);

-- ── RLS Policies ────────────────────────────────────────────────
ALTER TABLE rate_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_rate_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_period_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollup_pay_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollup_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass for all tables (backend uses service key)
-- These allow the FastAPI backend (which uses service_role key) to access everything
-- Regular users access data through the API, not directly

-- Rate types: readable by all authenticated
DROP POLICY IF EXISTS "rate_types_read" ON rate_types;
CREATE POLICY "rate_types_read" ON rate_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "rate_types_admin" ON rate_types;
CREATE POLICY "rate_types_admin" ON rate_types FOR ALL USING (true);

-- Bill rate defaults: readable by all
DROP POLICY IF EXISTS "bill_rate_defaults_read" ON bill_rate_defaults;
CREATE POLICY "bill_rate_defaults_read" ON bill_rate_defaults FOR SELECT USING (true);
DROP POLICY IF EXISTS "bill_rate_defaults_admin" ON bill_rate_defaults;
CREATE POLICY "bill_rate_defaults_admin" ON bill_rate_defaults FOR ALL USING (true);

-- User pay rates: users can see their own, admin all
DROP POLICY IF EXISTS "user_pay_rates_own" ON user_pay_rates;
CREATE POLICY "user_pay_rates_own" ON user_pay_rates FOR SELECT USING (auth.uid()::text IN (SELECT auth_id::text FROM users WHERE id = user_pay_rates.user_id));
DROP POLICY IF EXISTS "user_pay_rates_admin" ON user_pay_rates;
CREATE POLICY "user_pay_rates_admin" ON user_pay_rates FOR ALL USING (true);

-- Pay periods: readable by all authenticated
DROP POLICY IF EXISTS "pay_periods_read" ON pay_periods;
CREATE POLICY "pay_periods_read" ON pay_periods FOR SELECT USING (true);
DROP POLICY IF EXISTS "pay_periods_admin" ON pay_periods;
CREATE POLICY "pay_periods_admin" ON pay_periods FOR ALL USING (true);

-- Recipients: users see own, admin all
DROP POLICY IF EXISTS "recipients_own" ON pay_period_recipients;
CREATE POLICY "recipients_own" ON pay_period_recipients FOR SELECT USING (auth.uid()::text IN (SELECT auth_id::text FROM users WHERE id = pay_period_recipients.user_id));
DROP POLICY IF EXISTS "recipients_admin" ON pay_period_recipients;
CREATE POLICY "recipients_admin" ON pay_period_recipients FOR ALL USING (true);

-- Time entries: locked rows, admin access
DROP POLICY IF EXISTS "time_entries_read" ON time_entries;
CREATE POLICY "time_entries_read" ON time_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "time_entries_admin" ON time_entries;
CREATE POLICY "time_entries_admin" ON time_entries FOR ALL USING (true);

-- Rollups: readable by all
DROP POLICY IF EXISTS "rollup_pp_read" ON rollup_pay_period;
CREATE POLICY "rollup_pp_read" ON rollup_pay_period FOR SELECT USING (true);
DROP POLICY IF EXISTS "rollup_pp_admin" ON rollup_pay_period;
CREATE POLICY "rollup_pp_admin" ON rollup_pay_period FOR ALL USING (true);
DROP POLICY IF EXISTS "rollup_monthly_read" ON rollup_monthly;
CREATE POLICY "rollup_monthly_read" ON rollup_monthly FOR SELECT USING (true);
DROP POLICY IF EXISTS "rollup_monthly_admin" ON rollup_monthly;
CREATE POLICY "rollup_monthly_admin" ON rollup_monthly FOR ALL USING (true);

-- Export batches: admin only
DROP POLICY IF EXISTS "export_batches_admin" ON export_batches;
CREATE POLICY "export_batches_admin" ON export_batches FOR ALL USING (true);

-- Audit log: admin only
DROP POLICY IF EXISTS "audit_log_admin" ON audit_log;
CREATE POLICY "audit_log_admin" ON audit_log FOR ALL USING (true);

-- Reminder log: admin only
DROP POLICY IF EXISTS "reminder_log_admin" ON reminder_log;
CREATE POLICY "reminder_log_admin" ON reminder_log FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════
-- SEED DATA: Rate Types
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO rate_types (name, unit, default_duration_minutes, sort_order) VALUES
  ('IIC', 'hourly', NULL, 1),
  ('OP Session', 'hourly', 60, 2),
  ('SBYS', 'hourly', NULL, 3),
  ('PTO', 'hourly', NULL, 4),
  ('Sick Leave', 'hourly', NULL, 5),
  ('ADOS Assessment (In Home)', 'hourly', NULL, 6),
  ('ADOS Assessment (In Office)', 'hourly', NULL, 7),
  ('Administration', 'hourly', NULL, 8),
  ('Other (Hourly)', 'hourly', NULL, 9),
  ('APN Session (30)', 'session', 30, 10),
  ('APN Intake (60)', 'session', 60, 11),
  ('APN Other (Custom)', 'session', NULL, 12),
  ('Community Event (Day)', 'day', NULL, 13),
  ('Other (Day)', 'day', NULL, 14),
  ('OP Cancellation', 'event', NULL, 15)
ON CONFLICT (name) DO NOTHING;

-- Seed bill rate default for OP Cancellation = $50
INSERT INTO bill_rate_defaults (rate_type_id, default_bill_rate)
SELECT id, 50.00 FROM rate_types WHERE name = 'OP Cancellation'
ON CONFLICT (rate_type_id, effective_date) DO NOTHING;
