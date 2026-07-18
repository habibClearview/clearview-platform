-- ============================================================
-- Clearview: forward-planned market activities (marketing events).
--
-- A market activity is a planned marketing/sales push: a cost, in a chosen
-- business unit, over one or more months, with an expected sales uplift. It is
-- proposed in Planning, approved by a coach/CEO/accountant, and once APPROVED
-- its cost automatically flows into the plan (P&L, cash flow, balance sheet)
-- for the months it covers. The expected-vs-actual impact is analysed later in
-- Clearview Intelligence.
--
-- This is deliberately SEPARATE from the existing retrospective
-- `management_events` log (which records what already happened and never
-- touches the engine). This table is forward-looking and approval-gated.
--
-- SAFE TO APPLY: additive only -- one brand-new table, nothing existing is
-- touched. Reads are scoped by RLS (super_coach/co_implementer, or anyone who
-- can already view the client). Paste into the Supabase SQL editor and Run.
--
-- Conventions (.github/scripts/validate-migration.py):
--   - client_id is TEXT (matches engagement_clients.id)
--   - columns referencing auth.users are UUID (none here)
--   - CREATE TABLE IF NOT EXISTS; RLS enabled
-- ============================================================

create table if not exists generic_market_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  unit_id text,                                    -- target business unit (from config.business_units[].id); null = whole business
  name text not null,
  description text,
  cost numeric not null default 0,                 -- total cost of the activity
  start_period date not null,                      -- first month it applies (YYYY-MM-01)
  months_count smallint not null default 1 check (months_count between 1 and 24), -- spread cost evenly over this many months
  cost_category text not null default 'direct_opex' check (cost_category in ('direct_opex', 'cost_of_sales')),
  expected_uplift_pct numeric,                     -- expected sales uplift %, used for before/after impact analysis
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  approved_by text,
  approved_at timestamptz,
  review_note text,                                -- set when sent back / rejected, so the proposer sees why
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_events_client on generic_market_events(client_id);

alter table generic_market_events enable row level security;

-- Internal users read all; anyone who can already view the client reads theirs.
-- Fail-closed: a super_coach sees everything; others only clients they can view.
drop policy if exists market_events_read on generic_market_events;
create policy market_events_read on generic_market_events for select using (my_role() in ('super_coach', 'co_implementer') or can_view_client(client_id));

-- Writes come from authenticated internal users (coach proposes, approver
-- decides) through the browser client, mirroring how generic_spend_requests and
-- generic_actuals are written. Scoped to clients the user can view.
drop policy if exists market_events_write on generic_market_events;
create policy market_events_write on generic_market_events for all using (my_role() in ('super_coach', 'co_implementer') or can_view_client(client_id)) with check (my_role() in ('super_coach', 'co_implementer') or can_view_client(client_id));
