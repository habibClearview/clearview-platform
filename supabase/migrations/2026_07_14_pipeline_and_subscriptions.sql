-- ============================================================
-- Pipeline tab: a deal (on programmes) can now record which service(s)
-- it's for, and a next-step note -- neither existed before, so the
-- pipeline card could show a stage and a value but nothing about what
-- was actually being discussed or what happens next.
--
-- Subscription tracking: service_engagements rows for the Portfolio
-- Intelligence subscription service can now record a level, a
-- paid-through date, and a billing term -- so a subscriber's card can
-- show real subscription health instead of just "active/paused".
--
-- SAFE TO APPLY: additive only (ADD COLUMN IF NOT EXISTS). Paste into
-- the Supabase SQL editor and Run.
-- ============================================================

alter table programmes add column if not exists deal_services text[];
alter table programmes add column if not exists deal_notes text;

alter table service_engagements add column if not exists subscription_level text;
alter table service_engagements add column if not exists paid_through_date date;
alter table service_engagements add column if not exists billing_term text check (billing_term in ('quarterly','yearly'));
