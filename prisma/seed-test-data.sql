-- Seed test data for roles and gates
-- Run with: psql -d your_database -f seed-test-data.sql

-- Insert Roles
INSERT INTO "Role" (name, slug, level, active, created_at, updated_at)
VALUES 
  ('Administrator', 'admin', 1, true, NOW(), NOW()),
  ('Manager', 'manager', 2, true, NOW(), NOW()),
  ('User', 'user', 3, true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Insert Gates (Feature Flags)
INSERT INTO "Gate" (name, slug, active, created_at, updated_at)
VALUES 
  ('Premium Features', 'premium-features', true, NOW(), NOW()),
  ('Beta Features', 'beta-features', true, NOW(), NOW()),
  ('Advanced Analytics', 'advanced-analytics', true, NOW(), NOW()),
  ('Data Export', 'data-export', true, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- Assign role to test user (if exists)
-- First, get the test user ID and role ID
DO $$
DECLARE
  test_user_id INTEGER;
  user_role_id INTEGER;
  premium_gate_id INTEGER;
  beta_gate_id INTEGER;
BEGIN
  -- Find test user
  SELECT id INTO test_user_id FROM "User" WHERE email LIKE '%testuser%' LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Get role and gate IDs
    SELECT id INTO user_role_id FROM "Role" WHERE slug = 'user';
    SELECT id INTO premium_gate_id FROM "Gate" WHERE slug = 'premium-features';
    SELECT id INTO beta_gate_id FROM "Gate" WHERE slug = 'beta-features';
    
    -- Assign user role
    INSERT INTO "UserRole" (user_id, role_id, created_at)
    VALUES (test_user_id, user_role_id, NOW())
    ON CONFLICT (user_id, role_id) DO NOTHING;
    
    -- Assign premium gate
    INSERT INTO "UserGate" (user_id, gate_id, created_at)
    VALUES (test_user_id, premium_gate_id, NOW())
    ON CONFLICT (user_id, gate_id) DO NOTHING;
    
    -- Assign beta gate
    INSERT INTO "UserGate" (user_id, gate_id, created_at)
    VALUES (test_user_id, beta_gate_id, NOW())
    ON CONFLICT (user_id, gate_id) DO NOTHING;
    
    RAISE NOTICE 'Assigned role and gates to test user (ID: %)', test_user_id;
  ELSE
    RAISE NOTICE 'No test user found. Create a user via signup first.';
  END IF;
END $$;
