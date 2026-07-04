-- ============================================================
-- Clearview: year-end close
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Per docs/ACCOUNTING_ARCHITECTURE.md section 6. This is deliberately a
-- separate, bigger ceremony on top of month-end close, not a new
-- independent lock -- month-end close (generic_period_close +
-- the database trigger on generic_actuals) already fully protects each
-- individual month's data once it's closed. A year can only be closed
-- once every one of its 12 months is already closed that way; this
-- table records the formal, once-only act of closing the year itself,
-- plus a permanent snapshot of the year-end position for audit and for
-- future annual reporting / investor document use.
-- ============================================================

create table if not exists generic_year_close (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  -- The period (YYYY-MM-01) of month 1 of this fiscal year -- matches
  -- generic_period_close.period for that month, giving an unambiguous
  -- join key without needing a separate "fiscal year number" concept
  -- that could drift out of sync with the actual plan.
  year_start_period date not null,
  closed boolean not null default false,
  closed_at timestamptz,
  closed_by text,
  -- Snapshot of the year-end Balance Sheet position (cash, receivables,
  -- payables, retained earnings, etc.) AT THE MOMENT of closing --
  -- permanent record even if the underlying generic_actuals data is
  -- later corrected via a formal reopen, and the reference point for
  -- next year's opening balances if/when that year's plan is set up.
  closing_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, year_start_period)
);

alter table generic_year_close enable row level security;
drop policy if exists client_scoped on generic_year_close;

-- Read access: same client-scoping as every other table.
create policy client_scoped_read on generic_year_close
  for select using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );

-- Write access is deliberately narrower than read: the AnnualTab UI only
-- shows the Close/Reopen action to super_coach/ceo/finance_manager, but
-- that alone only hides the button -- it doesn't stop a request being
-- sent directly. Closing a year is a significant, once-only ceremony
-- (see docs/ACCOUNTING_ARCHITECTURE.md section 6), not something every
-- role with client access should be able to trigger.
create policy client_scoped_write on generic_year_close
  for all using (
    my_role() = ANY (ARRAY['super_coach','ceo','finance_manager'])
    and (my_role() = 'super_coach' or client_id = my_engagement_client_id())
  );
