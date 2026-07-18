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
  created_by text,                                 -- display name only (who proposed it)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The IMMUTABLE, server-set identity of the proposer. It defaults to the
-- authenticated user (auth.uid()) and the insert policy forces it to equal
-- auth.uid(), so it can never be spoofed by the browser. This is what the
-- proposer-scoped edit/delete rules below rely on — not the free-text
-- created_by. Nullable so the column can be added to a table that may already
-- hold rows; every new row gets the real authenticated id.
alter table generic_market_events add column if not exists created_by_uid uuid references auth.users(id) default auth.uid();

create index if not exists idx_market_events_client on generic_market_events(client_id);

alter table generic_market_events enable row level security;

-- Operation-specific policies so the DATABASE — not just the app — enforces who
-- can do what, keyed to the authenticated user. Everything is scoped to clients
-- the user can already view (can_view_client covers the client's own users,
-- their assigned coach, and their funder). The rules:
--   * INSERT: only as a 'proposed' row, and created_by_uid must be the caller.
--   * UPDATE: an APPROVER role (super_coach/coach/ceo/finance_manager) may make
--     any transition; otherwise only the ORIGINAL PROPOSER may edit, and only
--     while keeping the row 'proposed' — so a non-approver can never self-approve
--     or touch someone else's activity.
--   * DELETE: an approver may delete; otherwise only the proposer, and only while
--     the row is still 'proposed' (an approved cost line can't be quietly pulled).
drop policy if exists market_events_read on generic_market_events;
drop policy if exists market_events_write on generic_market_events;   -- replaced by the split policies below
drop policy if exists market_events_insert on generic_market_events;
drop policy if exists market_events_update on generic_market_events;
drop policy if exists market_events_delete on generic_market_events;

create policy market_events_read on generic_market_events for select using (my_role() = 'super_coach' or can_view_client(client_id));

create policy market_events_insert on generic_market_events for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and status = 'proposed' and created_by_uid = auth.uid());

-- The ownership + status test must be in USING as well as WITH CHECK. USING
-- decides which EXISTING rows a non-approver may target; without it, a
-- non-approver could target someone else's proposed row and set created_by_uid
-- to themselves (passing WITH CHECK) — taking over ownership. With it, a
-- non-approver can only ever touch their OWN still-proposed activity.
create policy market_events_update on generic_market_events for update
  using (
    (my_role() = 'super_coach' or can_view_client(client_id))
    and (
      my_role() in ('super_coach', 'coach', 'ceo', 'finance_manager')
      or (status = 'proposed' and created_by_uid = auth.uid())
    )
  )
  with check (
    (my_role() = 'super_coach' or can_view_client(client_id))
    and (
      my_role() in ('super_coach', 'coach', 'ceo', 'finance_manager')
      or (status = 'proposed' and created_by_uid = auth.uid())
    )
  );

create policy market_events_delete on generic_market_events for delete
  using (
    (my_role() = 'super_coach' or can_view_client(client_id))
    and (
      my_role() in ('super_coach', 'coach', 'ceo', 'finance_manager')
      or (status = 'proposed' and created_by_uid = auth.uid())
    )
  );
