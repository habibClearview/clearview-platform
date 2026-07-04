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
drop policy if exists client_scoped on generic_actuals;
create policy client_scoped on generic_actuals
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_actuals.client_id)
    )
  );

drop policy if exists auth_all on generic_model_config;
drop policy if exists client_scoped on generic_model_config;
create policy client_scoped on generic_model_config
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_model_config.client_id)
    )
  );

drop policy if exists auth_all on generic_spend_requests;
drop policy if exists client_scoped on generic_spend_requests;
create policy client_scoped on generic_spend_requests
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_spend_requests.client_id)
    )
  );

drop policy if exists auth_all on generic_period_close;
drop policy if exists client_scoped on generic_period_close;
create policy client_scoped on generic_period_close
  for all using (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and (up.role = 'super_coach' or up.engagement_client_id = generic_period_close.client_id)
    )
  );

-- Safety net for this cutover and any future one: warn loudly (not
-- silently) if any non-super_coach user still has no engagement_client_id
-- -- that user would lose all access to generic_* tables the moment
-- these policies take effect. Verified empirically at the time this
-- migration was written: only 2 real user_profiles rows exist
-- (super_coach, exempted; one CONAS CEO, already correctly backfilled)
-- -- but this check makes that fact self-verifying on every future run,
-- not just a one-time assertion that happened to be true.
do $$
declare
  unmigrated_count int;
begin
  select count(*) into unmigrated_count
  from user_profiles
  where role != 'super_coach' and engagement_client_id is null;
  if unmigrated_count > 0 then
    raise warning 'RLS cutover: % non-super_coach user_profiles row(s) still have no engagement_client_id and will lose access to generic_* tables under these policies. Backfill them before relying on this migration.', unmigrated_count;
  end if;
end $$;
