-- ═══════════════════════════════════════════════════════════════════
-- V6: App Settings Table
-- Stores API keys and config that Railway env vars won't inject.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- RLS: only service role can read/write (no anon access)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- No policies = only service-role key can access (bypasses RLS)
-- This keeps secrets safe from anon/public access.

-- Insert the Anthropic API key (replace with your actual key)
INSERT INTO app_settings (key, value) VALUES
  ('ANTHROPIC_API_KEY', 'REPLACE_WITH_YOUR_KEY')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
