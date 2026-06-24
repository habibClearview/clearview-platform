-- ============================================================
-- RUN THIS FIRST in Supabase SQL Editor
-- Adds assigned_unit_ids column to user_profiles if missing
-- Safe to run multiple times
-- ============================================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS assigned_unit_ids TEXT[] DEFAULT '{}';

-- Update RLS policy so coaches can read all profiles (using JWT role check)
-- Drop old policy that caused infinite recursion and replace
DROP POLICY IF EXISTS "coaches_read_all_profiles" ON user_profiles;

CREATE POLICY "coaches_read_all_profiles"
ON user_profiles FOR SELECT
USING (
  id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'coach'
  OR EXISTS (
    SELECT 1 FROM user_profiles up2
    WHERE up2.id = auth.uid()
    AND up2.role IN ('ceo', 'super_coach', 'finance_manager')
    AND up2.client_id = user_profiles.client_id
    LIMIT 1
  )
);

-- Policy: clients can only read model_config for their own client
DROP POLICY IF EXISTS "auth_client_access_model_config" ON model_config;
CREATE POLICY "auth_client_access_model_config"
ON model_config FOR ALL
USING (
  client_id IN (
    SELECT client_id FROM user_profiles WHERE id = auth.uid()
  )
);

-- Add model_config for CONAS if not exists
-- (will be created automatically when data is first saved)

SELECT 'Migration complete' as status;
