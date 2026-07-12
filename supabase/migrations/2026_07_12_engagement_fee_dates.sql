-- ============================================================
-- Clearview Coach: fee invoice/payment dates for "My Business at a glance".
--
-- engagement_clients.fee_status (paid | invoiced | unpaid) already exists
-- (2026_07_11_coach_payments_deals_fees.sql) but carries no dates, so
-- "fees received this year" and "my own DSO (avg days to collect)" on the
-- approved My Business design couldn't be computed honestly -- only
-- fabricated. This adds the two dates needed, and nothing else.
--
-- SAFE TO APPLY: additive only (ADD COLUMN IF NOT EXISTS). Nothing existing
-- is dropped or altered. Paste into the Supabase SQL editor and Run.
-- ============================================================

alter table engagement_clients add column if not exists fee_invoiced_at date;
alter table engagement_clients add column if not exists fee_paid_at date;
