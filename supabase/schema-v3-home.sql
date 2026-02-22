-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Schema v3 Migration: Wins, Meetings, Announcements
-- Run this in Supabase SQL Editor AFTER schema-v2-tasks.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─── Wins ────────────────────────────────────────────────────────
-- Shared team feed for business and personal wins.
CREATE TABLE IF NOT EXISTS wins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('business','personal')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wins_user     ON wins(user_id);
CREATE INDEX IF NOT EXISTS idx_wins_created  ON wins(created_at DESC);

-- ─── Meeting Templates ───────────────────────────────────────────
-- Defines recurring meeting blueprints. Instances are generated from these.
CREATE TABLE IF NOT EXISTS meeting_templates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               TEXT NOT NULL,
  cadence             TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','monthly_interval','quarterly','yearly')),
  -- schedule_rule stores JSONB with cadence-specific fields:
  --   weekly:            { "day_of_week": 0 }                          (0=Mon..6=Sun)
  --   weekly+skip_last:  { "day_of_week": 0, "skip_last": true }      (skip last week of month)
  --   monthly:           { "nth": 3, "day_of_week": 4 }               (3rd Friday; -1 = last)
  --   monthly_interval:  { "day_of_month": 2, "every_n_months": 2, "anchor": "2026-03-02" }
  --   quarterly:         { "month_of_quarter": 2, "nth": 2, "day_of_week": 1 }
  --   yearly:            { "month": 5, "day": 15 }
  schedule_rule       JSONB NOT NULL DEFAULT '{}',
  -- empty array = visible to all roles
  audience_roles      TEXT[] DEFAULT '{}',
  active              BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ─── Meeting Instances ───────────────────────────────────────────
-- Auto-generated from templates over a rolling window.
CREATE TABLE IF NOT EXISTS meeting_instances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id   UUID NOT NULL REFERENCES meeting_templates(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  meeting_date  DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  -- Prevent duplicate generation
  UNIQUE (template_id, meeting_date)
);

CREATE INDEX IF NOT EXISTS idx_meeting_instances_date     ON meeting_instances(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_instances_template ON meeting_instances(template_id);

-- ─── Announcements ──────────────────────────────────────────────
-- Admin-posted announcements with date-based visibility.
CREATE TABLE IF NOT EXISTS announcements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               TEXT NOT NULL,
  body                TEXT,
  category            TEXT NOT NULL DEFAULT 'general'
                        CHECK (category IN ('policy','celebration','outing','general')),
  -- empty array = visible to all roles
  audience_roles      TEXT[] DEFAULT '{}',
  effective_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date     DATE,
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_dates ON announcements(effective_date, expiration_date);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE wins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements     ENABLE ROW LEVEL SECURITY;

-- ─── wins policies ──────────────────────────────────────────────

-- All authenticated users can view all wins (shared feed)
CREATE POLICY "anyone_view_wins" ON wins
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can insert their own wins
CREATE POLICY "user_insert_wins" ON wins
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Users can update their own wins
CREATE POLICY "user_update_wins" ON wins
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Users can delete their own wins
CREATE POLICY "user_delete_wins" ON wins
  FOR DELETE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Admin can do anything with wins
CREATE POLICY "admin_all_wins" ON wins
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- ─── meeting_templates policies ─────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_meeting_templates" ON meeting_templates
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Non-admin: view templates matching their role or public (empty audience_roles)
CREATE POLICY "user_view_meeting_templates" ON meeting_templates
  FOR SELECT USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) != 'admin'
    AND active = true
    AND (
      array_length(audience_roles, 1) IS NULL
      OR audience_roles = '{}'
      OR (SELECT role FROM users WHERE auth_id = auth.uid()) = ANY(audience_roles)
    )
  );

-- ─── meeting_instances policies ─────────────────────────────────

-- All authenticated: view all instances (filtering by role happens via template join)
CREATE POLICY "anyone_view_meeting_instances" ON meeting_instances
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Admin: full CRUD (generator inserts via service key, but this covers admin UI)
CREATE POLICY "admin_all_meeting_instances" ON meeting_instances
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- ─── announcements policies ─────────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_announcements" ON announcements
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Non-admin: view current announcements matching their role
CREATE POLICY "user_view_announcements" ON announcements
  FOR SELECT USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) != 'admin'
    AND effective_date <= CURRENT_DATE
    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
    AND (
      array_length(audience_roles, 1) IS NULL
      OR audience_roles = '{}'
      OR (SELECT role FROM users WHERE auth_id = auth.uid()) = ANY(audience_roles)
    )
  );
