-- ============================================================
-- Clearview: client-scoped RLS, replacing the permissive "any logged-in
-- user" policy on generic_* tables
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Prerequisite: 2026_07_04_user_profiles_engagement_client_bridge.sql
-- must already be applied (adds user_profiles.engagement_client_id).
--
-- Previously, every generic_* table's RLS policy only checked
-- auth.role() = 'authenticated' -- ANY logged-in user could read or
-- write ANY client's rows, with isolation between different clients
-- relying entirely on the application code filtering by client_id,
-- never enforced at the database level. This closes that gap.
--
-- super_coach (Habib) is the deliberate exception -- sees every client,
-- matching the app-level permission model already in place.
-- ============================================================

drop policy if exists auth_all on generic_actuals;
create policy client_scoped on generic_actuals
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_actuals.client_id)
    )
  );

drop policy if exists auth_all on generic_model_config;
create policy client_scoped on generic_model_config
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_model_config.client_id)
    )
  );

drop policy if exists auth_all on generic_spend_requests;
create policy client_scoped on generic_spend_requests
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_spend_requests.client_id)
    )
  );

drop policy if exists auth_all on generic_period_close;
create policy client_scoped on generic_period_close
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_period_close.client_id)
    )
  );
