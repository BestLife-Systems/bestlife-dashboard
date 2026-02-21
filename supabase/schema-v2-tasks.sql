-- ═══════════════════════════════════════════════════════════════════
-- BestLife Hub — Schema v2 Migration: Tasks + Knowledge Base
-- Run this in Supabase SQL Editor AFTER schema.sql (v1)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Task Templates ───────────────────────────────────────────────
-- Defines repeating task blueprints. Instances are generated from these.
CREATE TABLE IF NOT EXISTS task_templates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                 TEXT NOT NULL,
  description           TEXT,
  tags                  TEXT[] DEFAULT '{}',
  priority              TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to_role      TEXT,
  assigned_to_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  schedule_type         TEXT NOT NULL DEFAULT 'weekly'
                          CHECK (schedule_type IN ('daily', 'weekly', 'monthly')),
  -- schedule_rule stores JSON:
  --   daily:   { "every_n_days": 1 }
  --   weekly:  { "weekdays": [0,1,2,3,4] }   (0=Mon, 6=Sun)
  --   monthly: { "day_of_month": 1 }
  schedule_rule         TEXT DEFAULT '{}',
  timezone              TEXT NOT NULL DEFAULT 'America/New_York',
  default_due_offset_days INT NOT NULL DEFAULT 0,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ─── Task Instances ───────────────────────────────────────────────
-- Auto-generated instances from templates (rolling 30-day window).
CREATE TABLE IF NOT EXISTS task_instances (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id           UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  tags                  TEXT[] DEFAULT '{}',
  priority              TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_role      TEXT,
  due_date              DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'backlog'
                          CHECK (status IN ('backlog', 'in_progress', 'done', 'skipped')),
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  -- Prevent duplicate generation for the same template + due date + assignee
  UNIQUE (template_id, due_date, assigned_to_user_id, assigned_to_role)
);

CREATE INDEX IF NOT EXISTS idx_task_instances_due ON task_instances(due_date);
CREATE INDEX IF NOT EXISTS idx_task_instances_user ON task_instances(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_role ON task_instances(assigned_to_role);
CREATE INDEX IF NOT EXISTS idx_task_instances_status ON task_instances(status);

-- ─── Task Comments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_instance_id      UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body                  TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_instance ON task_comments(task_instance_id);

-- ─── KB Articles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_articles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                 TEXT NOT NULL,
  body_markdown         TEXT,
  tags                  TEXT[] DEFAULT '{}',
  -- empty array = visible to all authenticated users
  audience_roles        TEXT[] DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published')),
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_tags ON kb_articles USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_kb_roles ON kb_articles USING gin(audience_roles);
CREATE INDEX IF NOT EXISTS idx_kb_status ON kb_articles(status);
-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_kb_search ON kb_articles USING gin(
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_markdown,''))
);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles    ENABLE ROW LEVEL SECURITY;

-- Helper: get the current user's row from our users table
CREATE OR REPLACE FUNCTION current_user_profile()
RETURNS users AS $$
  SELECT * FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── task_templates policies ──────────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_templates" ON task_templates
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Non-admin: view templates assigned to their role or user
CREATE POLICY "user_view_own_templates" ON task_templates
  FOR SELECT USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) != 'admin'
    AND (
      assigned_to_role = (SELECT role FROM users WHERE auth_id = auth.uid())
      OR assigned_to_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR (assigned_to_role IS NULL AND assigned_to_user_id IS NULL)  -- global templates
    )
    AND active = true
  );

-- ─── task_instances policies ──────────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_instances" ON task_instances
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Non-admin: view instances assigned to them or their role
CREATE POLICY "user_view_own_instances" ON task_instances
  FOR SELECT USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) != 'admin'
    AND (
      assigned_to_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      OR assigned_to_role = (SELECT role FROM users WHERE auth_id = auth.uid())
    )
  );

-- Non-admin: update status on their own instances
CREATE POLICY "user_update_own_instances" ON task_instances
  FOR UPDATE USING (
    assigned_to_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR assigned_to_role = (SELECT role FROM users WHERE auth_id = auth.uid())
  );

-- ─── task_comments policies ───────────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_comments" ON task_comments
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Users: view comments on tasks they can see
CREATE POLICY "user_view_comments" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM task_instances ti
      WHERE ti.id = task_instance_id
        AND (
          ti.assigned_to_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
          OR ti.assigned_to_role = (SELECT role FROM users WHERE auth_id = auth.uid())
        )
    )
  );

-- Users: insert their own comments
CREATE POLICY "user_insert_comments" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── kb_articles policies ─────────────────────────────────────────

-- Admin: full CRUD
CREATE POLICY "admin_all_kb" ON kb_articles
  FOR ALL USING (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
  );

-- Authenticated users: view published articles visible to their role
CREATE POLICY "user_view_kb" ON kb_articles
  FOR SELECT USING (
    status = 'published'
    AND (
      array_length(audience_roles, 1) IS NULL     -- empty = public to all
      OR audience_roles = '{}'
      OR (SELECT role FROM users WHERE auth_id = auth.uid()) = ANY(audience_roles)
    )
  );
