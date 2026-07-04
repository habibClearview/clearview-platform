-- ============================================================
-- Clearview: month-end close
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Per docs/ACCOUNTING_ARCHITECTURE.md section 5: closing a month means
-- the Finance Manager/CEO has reviewed an exception report (unusual
-- revenue movements, and any catalogue item whose cost price hasn't been
-- reviewed in 90+ days) and locked the period. This is a COMPANY-WIDE
-- close, not per business unit -- one action closes every unit's actuals
-- for that period together, which is why this is its own table rather
-- than inferred from generic_actuals.approved per unit (which could get
-- out of sync if a new unit's actuals arrive after close).
-- ============================================================

create table if not exists generic_period_close (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  period date not null,
  closed boolean not null default false,
  closed_at timestamptz,
  closed_by text,
  -- Snapshot of what the exception report showed AT THE MOMENT of
  -- closing, for audit -- so "what did we know when we closed this" is
  -- answerable later, even if catalogue cost prices get updated afterward.
  exception_report jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, period)
);

create index if not exists idx_generic_period_close_client_period
  on generic_period_close (client_id, period);
