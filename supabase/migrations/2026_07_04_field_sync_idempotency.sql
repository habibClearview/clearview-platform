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

-- Plain (non-partial) unique indexes. Two things make this safe:
-- 1. Standard SQL unique constraints already treat NULL as "not equal to
--    itself" -- any number of rows with local_id IS NULL (all data from
--    before this migration) can coexist without violating uniqueness.
--    The earlier partial-index version (`where local_id is not null`)
--    was solving a problem that didn't actually exist.
-- 2. Postgres requires the ON CONFLICT target in an upsert to exactly
--    match an existing constraint or index. app/api/field/sync/route.ts
--    upserts with onConflict: 'client_id,local_id' -- a partial index
--    cannot serve as that conflict arbiter, so the earlier version would
--    have made every sync with a local_id fail outright.
create unique index if not exists idx_field_transactions_client_local_id
  on field_transactions (client_id, local_id);

create unique index if not exists idx_field_credit_transactions_client_local_id
  on field_credit_transactions (client_id, local_id);
