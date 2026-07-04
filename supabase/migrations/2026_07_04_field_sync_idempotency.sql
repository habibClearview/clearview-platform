-- ============================================================
-- Clearview Field: idempotency keys for sync
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
-- Safe to re-run: every statement uses IF NOT EXISTS.
--
-- Why: the field capture page now has three ways a sync can fire for the
-- same queued entry -- the manual "Sync Now" button, an automatic retry
-- when the device comes back online, and a Service Worker Background Sync
-- that can run even with the tab closed. Without a stable identity per
-- transaction, an overlapping or retried sync could insert the same sale
-- or cost twice. local_id (already generated client-side per entry) is
-- that stable identity -- unique per client, so a repeat insert with the
-- same local_id is silently ignored rather than duplicated.
-- ============================================================

alter table field_transactions
  add column if not exists local_id text;

alter table field_credit_transactions
  add column if not exists local_id text;

-- Partial unique index (ignores NULLs) so old rows without a local_id
-- (recorded before this migration) don't collide with each other or block
-- the constraint from being created.
create unique index if not exists idx_field_transactions_client_local_id
  on field_transactions (client_id, local_id) where local_id is not null;

create unique index if not exists idx_field_credit_transactions_client_local_id
  on field_credit_transactions (client_id, local_id) where local_id is not null;
