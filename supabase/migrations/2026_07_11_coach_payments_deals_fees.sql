-- ============================================================
-- Clearview / Canvas Coach: Team & Payments loop, deals pipeline,
-- and per-engagement fees.
--
-- Powers the coach dashboard's "Team & Payments" (day-based
-- timesheets logged in hours, expenses, advances, and an
-- auto-generated invoice per co-implementer per period), the
-- "Programmes & Deals" pipeline, and per-engagement profitability.
--
-- SAFE TO APPLY: every statement is additive (CREATE ... IF NOT
-- EXISTS / ADD COLUMN IF NOT EXISTS). Nothing existing is dropped
-- or altered, so applying this cannot break any current feature.
-- Paste into the Supabase SQL editor and Run.
--
-- Business rules (see docs/gtcv/README.md):
--   * a day = 8 hours; days = hours / 8
--   * day rate is set per co-implementer
--   * an unreconciled advance blocks the next invoice from issuing
--
-- RLS: this is the coach's own operational/financial data, so it is
-- scoped to super_coach only, matching the existing co_implementers
-- and programmes policies in 2026_07_04_comprehensive_rls_audit.sql.
-- When co-implementer login is built (a GtCV-phase feature), add
-- co-implementer-scoped read policies then.
-- ============================================================

-- 1) Day rate on each co-implementer -------------------------------
alter table co_implementers add column if not exists day_rate numeric;
alter table co_implementers add column if not exists rate_currency text default 'USD';

-- 2) Timesheet entries: logged in HOURS per task, per day ----------
--    Days are derived at read time as hours / 8. Kept separate from
--    the existing timesheets table so nothing that reads that table
--    is affected.
create table if not exists coach_timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  co_implementer_id text references co_implementers(id) on delete cascade,
  client_id text,
  entry_date date not null,
  task text,
  hours numeric not null default 0,
  period text,                       -- invoicing period label, e.g. '2026-07-W1'
  status text not null default 'draft',   -- draft | submitted | approved
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_coach_ts_ci_period on coach_timesheet_entries(co_implementer_id, period);

-- 3) Expenses to reclaim -------------------------------------------
create table if not exists coach_expenses (
  id uuid primary key default gen_random_uuid(),
  co_implementer_id text references co_implementers(id) on delete cascade,
  client_id text,
  expense_date date not null,
  description text,
  category text,                     -- travel | accommodation | comms | materials | other
  amount numeric not null default 0,
  currency text default 'USD',
  receipt_url text,
  period text,
  status text not null default 'submitted',  -- submitted | approved | rejected
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_exp_ci_period on coach_expenses(co_implementer_id, period);

-- 4) Advances, reconciled against actual spend ---------------------
create table if not exists coach_advances (
  id uuid primary key default gen_random_uuid(),
  co_implementer_id text references co_implementers(id) on delete cascade,
  amount numeric not null default 0,
  currency text default 'USD',
  advance_date date not null,
  reason text,
  due_date date,                     -- reconciliation due date
  reconciled boolean not null default false,
  reconciled_at timestamptz,
  applied_invoice_id uuid,           -- the invoice this advance was netted against
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_adv_ci_open on coach_advances(co_implementer_id) where not reconciled;

-- 5) Invoices: auto-drafted as (days x rate) + expenses - advance --
create table if not exists coach_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  co_implementer_id text references co_implementers(id) on delete set null,
  period text not null,
  days numeric not null default 0,
  day_rate numeric not null default 0,
  time_amount numeric not null default 0,       -- days x day_rate
  expenses_amount numeric not null default 0,   -- approved reclaims
  advance_applied numeric not null default 0,   -- advance netted off
  net_amount numeric not null default 0,        -- payable to the co-implementer
  currency text default 'USD',
  due_date date,
  status text not null default 'draft',         -- draft | issued | paid
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_coach_inv_ci_period on coach_invoices(co_implementer_id, period);

-- 6) Deals pipeline on programmes (who pays) -----------------------
alter table programmes add column if not exists deal_stage text;        -- conversation | scoping | proposal | won | lost
alter table programmes add column if not exists deal_value numeric;
alter table programmes add column if not exists deal_probability numeric;  -- 0..100
alter table programmes add column if not exists deal_currency text default 'USD';
alter table programmes add column if not exists deal_expected_close date;

-- 7) Per-engagement fee and payment status (who is served) ---------
alter table engagement_clients add column if not exists engagement_fee numeric;
alter table engagement_clients add column if not exists fee_currency text default 'USD';
alter table engagement_clients add column if not exists fee_status text;    -- paid | invoiced | unpaid

-- 8) RLS: super_coach only, matching co_implementers / programmes --
alter table coach_timesheet_entries enable row level security;
alter table coach_expenses          enable row level security;
alter table coach_advances          enable row level security;
alter table coach_invoices          enable row level security;

drop policy if exists client_scoped on coach_timesheet_entries;
create policy client_scoped on coach_timesheet_entries for all using (my_role() = 'super_coach');

drop policy if exists client_scoped on coach_expenses;
create policy client_scoped on coach_expenses for all using (my_role() = 'super_coach');

drop policy if exists client_scoped on coach_advances;
create policy client_scoped on coach_advances for all using (my_role() = 'super_coach');

drop policy if exists client_scoped on coach_invoices;
create policy client_scoped on coach_invoices for all using (my_role() = 'super_coach');
