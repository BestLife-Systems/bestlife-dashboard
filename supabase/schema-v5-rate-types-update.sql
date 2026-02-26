-- ═══════════════════════════════════════════════════════════════════
-- V5: Update Rate Types
-- - Remove: IIC (generic), APN 30 Min, ADOS At Office, ADOS In Home (hourly versions),
--           Other (Hourly), Other (Day), APN Other (Custom)
-- - Add: IIC-LC, IIC-MA, IIC-BA
-- - Split OP: OP-LC Session, OP-MA Session
-- - Rename ADOS to session-based
-- - Group and reorder
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Deactivate rate types to remove
UPDATE rate_types SET is_active = false WHERE name IN (
  'IIC',
  'APN 30 Min',
  'ADOS Assessment (In Home)',
  'ADOS Assessment (In Office)',
  'Other (Hourly)',
  'Other (Day)',
  'APN Other (Custom)'
);

-- Step 2: Add new IIC split types
INSERT INTO rate_types (name, unit, default_duration_minutes, sort_order) VALUES
  ('IIC-LC', 'hourly', NULL, 1),
  ('IIC-MA', 'hourly', NULL, 2),
  ('IIC-BA', 'hourly', NULL, 3)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = true;

-- Step 3: Rename OP Session → OP-LC Session, add OP-MA Session
UPDATE rate_types SET name = 'OP-LC Session', sort_order = 4 WHERE name = 'OP Session';

INSERT INTO rate_types (name, unit, default_duration_minutes, sort_order) VALUES
  ('OP-MA Session', 'hourly', 60, 5)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = true;

-- Step 4: Add new ADOS types (session-based, not hourly)
INSERT INTO rate_types (name, unit, default_duration_minutes, sort_order) VALUES
  ('ADOS Assessment - In Home', 'session', NULL, 8),
  ('ADOS Assessment - At Office', 'session', NULL, 9)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = true;

-- Step 5: Reorder remaining types
UPDATE rate_types SET sort_order = 6 WHERE name = 'SBYS';
UPDATE rate_types SET sort_order = 7 WHERE name = 'Administration';
UPDATE rate_types SET sort_order = 10 WHERE name = 'APN Session (30)';
UPDATE rate_types SET sort_order = 11 WHERE name = 'APN Intake (60)';
UPDATE rate_types SET sort_order = 12 WHERE name = 'PTO';
UPDATE rate_types SET sort_order = 13 WHERE name = 'Sick Leave';
UPDATE rate_types SET sort_order = 14 WHERE name = 'Community Event (Day)';
UPDATE rate_types SET sort_order = 15 WHERE name = 'OP Cancellation';
