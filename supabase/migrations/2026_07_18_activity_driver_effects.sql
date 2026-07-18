-- ============================================================
-- Clearview: activities target drivers (driver_effects).
--
-- A market activity is meant to MOVE a driver — "this radio campaign should add
-- 50 walk-in customers/month". Because the business is spread-based, lifting a
-- volume driver flows through the buy/sell spread to margin automatically. This
-- migration adds the column that stores which drivers an activity moves, and by
-- how much, so an APPROVED activity's expected effect can be applied to the
-- drivers when the plan is run (see src/lib/activity-driver-impact.ts).
--
-- Shape (JSON array; empty/absent means the activity only costs money, no lift):
--   [{ "driver_id": "drv_...", "mode": "absolute", "value": 50 }, ...]
--     - mode 'absolute' adds `value` units to the driver's monthly quantity
--     - mode 'percent'  raises the driver's monthly quantity by `value`%
--
-- SAFE TO APPLY: additive only -- one new nullable column on an existing table.
-- Nothing existing is touched; existing rows get NULL (no effect). Reads/writes
-- stay governed by the table's existing RLS policies (an approver, or the
-- proposer while the row is still 'proposed'). Paste into the Supabase SQL
-- editor and Run.
--
-- Conventions (.github/scripts/validate-migration.py):
--   - client_id is TEXT (matches engagement_clients.id) -- unchanged here
--   - columns referencing auth.users are UUID -- none added here
--   - the table already has RLS enabled
-- ============================================================

alter table generic_market_events
  add column if not exists driver_effects jsonb;
