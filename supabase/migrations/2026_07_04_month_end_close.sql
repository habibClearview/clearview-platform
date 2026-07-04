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

-- No separate index on (client_id, period): the unique constraint above
-- already creates a btree index on exactly these columns, in this order.
-- A second explicit index would just add write overhead for nothing.

-- RLS: matches the existing "auth_all" pattern already used on every
-- sibling generic_* table (generic_actuals, generic_model_config,
-- generic_spend_requests). Without ANY policy, this table would be
-- reachable by the service role key (used in this session's live
-- verification) but NOT by the browser's authenticated client -- meaning
-- the actual coach/CEO/Finance Manager users in the app would get
-- "permission denied" trying to use this feature at all.
--
-- IMPORTANT, flagged but deliberately NOT fixed here (out of scope for
-- this step): the existing "auth_all" pattern only checks
-- auth.role() = 'authenticated' -- it does NOT scope by client_id. Any
-- authenticated user can currently read or write ANY client's rows in
-- generic_actuals, generic_model_config, generic_spend_requests, and now
-- generic_period_close too -- isolation between different clients
-- (CONAS, Wonderland, Kenali, etc.) relies entirely on the application
-- code filtering by client_id, never enforced at the database level.
-- This is a genuine, pre-existing, cross-cutting gap spanning multiple
-- tables built across earlier sessions, not something introduced by this
-- migration -- matching the existing pattern here keeps this table
-- consistent and working, but the underlying gap needs its own dedicated
-- fix across all of these tables together, not a one-off patch on the
-- newest table only.
alter table generic_period_close enable row level security;

drop policy if exists auth_all on generic_period_close;
create policy auth_all on generic_period_close
  for all using (auth.role() = 'authenticated');

-- Defense in depth: the app's save() function checks periodClose.closed
-- client-side, but that alone can be bypassed by a stale client (cached
-- state from before a period closed), a direct API call, or any other
-- write path (including aggregate_field_transactions(), which writes to
-- generic_actuals too). This trigger rejects the write at the database
-- level regardless of how it was attempted, closing that gap properly
-- rather than relying on the UI to be the only thing enforcing it.
create or replace function reject_write_to_closed_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from generic_period_close
    where client_id = NEW.client_id and period = NEW.period and closed = true
  ) then
    raise exception 'This period (%) is closed and cannot be edited. Ask your Finance Manager to reopen it first.', NEW.period;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reject_write_to_closed_period on generic_actuals;
create trigger trg_reject_write_to_closed_period
  before insert or update on generic_actuals
  for each row execute function reject_write_to_closed_period();
