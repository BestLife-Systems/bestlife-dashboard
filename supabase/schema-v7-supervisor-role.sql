-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Database Migration v7: Add Supervisor Role
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Add supervisor role to the CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller', 'apn', 'intern', 'supervisor'));