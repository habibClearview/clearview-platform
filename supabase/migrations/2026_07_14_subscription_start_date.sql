-- ============================================================
-- Clearview Coach: subscription start date for independent Clearview
-- clients ("subscribers" -- self-paying, no programme, engagement_mode
-- 'financial'). The coach dashboard's "Clearview Subscriptions" figure was
-- only ever a derived count/value from engagement_fee -- there was no real
-- per-client subscriber list and no date to show when a subscription
-- started or is due for renewal. This adds the one field needed for that,
-- and nothing else.
--
-- SAFE TO APPLY: additive only (ADD COLUMN IF NOT EXISTS). Nothing existing
-- is dropped or altered. Paste into the Supabase SQL editor and Run.
-- ============================================================

alter table engagement_clients add column if not exists subscription_start_date date;
