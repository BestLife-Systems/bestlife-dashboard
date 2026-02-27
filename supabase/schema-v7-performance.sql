-- ═══════════════════════════════════════════════════════════════════
-- V7: Performance Tracking — employment_status + therapist_capacity
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add employment_status to users
-- Separate from role — a clinical_leader can be part-time, etc.
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_status TEXT
  DEFAULT 'full_time'
  CHECK (employment_status IN ('full_time', 'part_time', '1099'));

-- 2. Therapist capacity table (IIC + OP target caseloads)
CREATE TABLE IF NOT EXISTS therapist_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iic_capacity INTEGER DEFAULT 0,
  op_capacity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_therapist_capacity_user ON therapist_capacity(user_id);

-- 4. RLS (service role bypasses; read-all for authenticated)
ALTER TABLE therapist_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "therapist_capacity_read" ON therapist_capacity;
CREATE POLICY "therapist_capacity_read" ON therapist_capacity FOR SELECT USING (true);

DROP POLICY IF EXISTS "therapist_capacity_admin" ON therapist_capacity;
CREATE POLICY "therapist_capacity_admin" ON therapist_capacity FOR ALL USING (true);
