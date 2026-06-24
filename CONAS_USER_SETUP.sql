-- ============================================================
-- CONAS USER SETUP — Run this in Supabase SQL Editor
-- Run AFTER inviting each user via Authentication → Users → Invite user
-- ============================================================

-- Step 1: Get the CONAS client ID
SELECT id, name, slug FROM clients WHERE slug = 'conas';
-- Copy the id value — use it in the INSERT statements below as CONAS_CLIENT_ID

-- Step 2: After inviting a user via Supabase Auth → Users → Invite user,
--         get their user ID:
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 10;

-- Step 3: Insert user profiles
-- Replace placeholders with actual UUIDs

-- CEO
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'CEO_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'ceo',
  'CEO Name Here',
  '{}'
);

-- Finance Manager
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'FINANCE_MGR_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'finance_manager',
  'Finance Manager Name Here',
  '{}'
);

-- FGE Services Manager (unit head for FGE unit)
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'FGE_MGR_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'unit_head',
  'FGE Manager Name Here',
  '{fge}'
);

-- Farm Manager (unit head for own_farm unit)
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'FARM_MGR_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'unit_head',
  'Farm Manager Name Here',
  '{own_farm}'
);

-- Input Centre Manager (unit head — can be assigned individual shops)
-- e.g. shop_1 and shop_2
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'INPUT_MGR_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'unit_head',
  'Input Manager Name Here',
  '{shop_1,shop_2}'
);

-- Accounts Assistant
INSERT INTO user_profiles (id, client_id, role, full_name, assigned_unit_ids)
VALUES (
  'ACCOUNTS_USER_ID_HERE',
  'CONAS_CLIENT_ID_HERE',
  'accounts_assistant',
  'Accounts Assistant Name Here',
  '{fge,own_farm,input_centres}'
);

-- ============================================================
-- VERIFY
-- ============================================================
SELECT u.email, p.role, p.full_name, p.assigned_unit_ids
FROM user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.client_id = 'CONAS_CLIENT_ID_HERE';

-- ============================================================
-- NOTES
-- ============================================================
-- Role values: ceo, finance_manager, unit_head, accounts_assistant, super_coach
-- assigned_unit_ids for unit heads: fge, own_farm, advisory, customer,
--   shop_1, shop_2, shop_3, shop_4, shop_5, input_centres (all shops)
-- CEO and Finance Manager: leave assigned_unit_ids as '{}'
--   they see all units automatically
-- To update a role: UPDATE user_profiles SET role='finance_manager' WHERE id='...'
-- To remove a user: DELETE FROM user_profiles WHERE id='...'
--   then deactivate in Authentication → Users
