-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Seed Meeting Templates
-- Run this AFTER schema-v3-home.sql
-- ═══════════════════════════════════════════════════════════════════

-- 1. Staff Sync — weekly, Monday (all staff)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Staff Sync', 'weekly', '{"day_of_week": 0}', '{}');

-- 2. Clinical Consultation — weekly, Wednesday (therapists + clinical leaders)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Clinical Consultation', 'weekly', '{"day_of_week": 2}', '{"therapist","clinical_leader"}');

-- 3. Admin Huddle — weekly, Friday (admin only)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Admin Huddle', 'weekly', '{"day_of_week": 4}', '{"admin"}');

-- 4. Clinical Leader Meeting — monthly, 3rd Friday (clinical leaders + admin)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Clinical Leader Meeting', 'monthly', '{"nth": 3, "day_of_week": 4}', '{"clinical_leader","admin"}');

-- 5. EOS Quarterly — quarterly, 2nd Tuesday of 2nd month of quarter (all staff)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('EOS Quarterly', 'quarterly', '{"month_of_quarter": 2, "nth": 2, "day_of_week": 1}', '{}');

-- 6. Full Staff — every 2 months on the 2nd, starting March 2, 2026 (all staff)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Full Staff', 'monthly_interval', '{"day_of_month": 2, "every_n_months": 2, "anchor": "2026-03-02"}', '{}');

-- 7. Weekly Leadership — weekly Monday, EXCEPT last Monday of month (admin only)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Weekly Leadership', 'weekly', '{"day_of_week": 0, "skip_last": true}', '{"admin"}');

-- 8. Marketing Meet — monthly, last Monday (admin only)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Marketing Meet', 'monthly', '{"nth": -1, "day_of_week": 0}', '{"admin"}');

-- 9. Group Supervision — monthly, last Thursday (therapists + clinical leaders)
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Group Supervision', 'monthly', '{"nth": -1, "day_of_week": 3}', '{"therapist","clinical_leader"}');

-- 10. Birthdays — yearly (placeholder — add real dates per employee)
-- Example entries:
INSERT INTO meeting_templates (title, cadence, schedule_rule, audience_roles) VALUES
('Birthday: Team Celebration', 'yearly', '{"month": 1, "day": 15}', '{}');
