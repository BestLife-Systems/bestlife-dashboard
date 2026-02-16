-- ═══════════════════════════════════════════════════════════════════
-- Seed Script: Create initial admin user
-- Run AFTER creating the admin user in Supabase Auth
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Create admin user in Supabase Auth first (via Dashboard → Authentication → Users → Add User)
-- Use email: admin@bestlifecounseling.com (or your admin email)
-- Note the UUID that Supabase assigns

-- Step 2: Replace 'YOUR_AUTH_UUID_HERE' with the actual auth UUID from step 1
-- Then run this SQL:

/*
INSERT INTO users (auth_id, email, first_name, last_name, role, is_active)
VALUES (
  'YOUR_AUTH_UUID_HERE',
  'admin@bestlifecounseling.com',
  'Admin',
  'User',
  'admin',
  true
);
*/

-- ─── OR: Quick setup with a known test password ──────────────────
-- You can also use the Supabase Dashboard to:
-- 1. Go to Authentication → Users → Add User
-- 2. Enter email + password
-- 3. Copy the user's ID
-- 4. Run the INSERT above with that ID

-- ─── Example therapist seed data (optional) ─────────────────────
/*
INSERT INTO therapists (name, first_name, last_name, is_apn) VALUES
  ('Celiese Flitcroft', 'Celiese', 'Flitcroft', false),
  ('Nicole Farrell', 'Nicole', 'Farrell', false),
  ('Kaitlyn Long', 'Kaitlyn', 'Long', false),
  ('Tracey Nagle', 'Tracey', 'Nagle', true),
  ('Loren Mccutcheon', 'Loren', 'Mccutcheon', false);
*/
