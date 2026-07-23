-- ============================================================
-- OPTIONAL CLEANUP — drop the retired CONAS / Wonderland bespoke tables
-- ============================================================
-- CONAS and Wonderland were bespoke, hand-built models. They have been retired:
-- their app code (dashboards, engines, routes) is removed, and only the generic
-- ClearView model (generic_model_config / generic_actuals / ...) and the GtCV
-- Canvas remain. If either business ever returns, they onboard through the
-- normal generic flow (intake link or spreadsheet upload) like every other
-- client — they will NOT use these tables again.
--
-- These tables were used ONLY by the removed bespoke code:
--   * model_config          — bespoke financial model store (CONAS + Wonderland)
--   * spend_requests        — CONAS spending-request workflow
--   * staff_time_records    — CONAS staff time capture
--   * unit_actuals          — CONAS per-unit actuals (pre-generic schema)
--   * monthly_actuals       — CONAS monthly actuals (pre-generic schema)
--
-- The live generic model uses the generic_* tables and is UNAFFECTED by this.
--
-- This migration is DESTRUCTIVE and SEPARATE on purpose: running it drops these
-- tables and any rows still in them. It is safe to run only once you are happy
-- the CONAS/Wonderland data is no longer needed. If you would rather keep the
-- (now orphaned, unused) tables around as a just-in-case backup, simply DO NOT
-- run this file — the platform works exactly the same either way, because no
-- remaining code reads or writes them.
--
-- CASCADE removes each table's own policies, indexes and constraints with it.
-- ============================================================

drop table if exists public.spend_requests      cascade;
drop table if exists public.staff_time_records   cascade;
drop table if exists public.unit_actuals         cascade;
drop table if exists public.monthly_actuals      cascade;
drop table if exists public.model_config         cascade;
