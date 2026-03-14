-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Database Migration v8: Add Supervision Rate Types
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Add Individual Supervision and Group Supervision rate types
-- Individual Supervision should come before Group Supervision
INSERT INTO rate_types (name, unit, default_duration_minutes, sort_order) VALUES
  ('Individual Supervision', 'session', 60, 16),
  ('Group Supervision', 'session', 60, 17)
ON CONFLICT (name) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_active = true;

-- Note: These should appear after OP Cancellation (sort_order 15)
-- in the Pay Rates catalog under a supervision section