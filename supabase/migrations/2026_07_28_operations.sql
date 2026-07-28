-- ============================================================
-- OPERATIONS  [additive]
--
-- Backs the "BUSINESS > Operations" section of the per-client dashboard
-- (OperationsTab.tsx), tabs: Deliveries · Complaints · Staff Scorecards.
-- (Stores/stock lives under its own Stores screen and is NOT touched here.)
--
-- Three brand-new tables, nothing existing is altered:
--   * op_deliveries      -- order/delivery fulfilment log (on-time vs delayed)
--   * op_complaints      -- customer complaints log (open vs resolved)
--   * op_staff_scores    -- optional manual scorecard rows per staff member
--
-- SAFE TO APPLY: purely additive. Paste into the Supabase SQL editor and Run.
--
-- Conventions (.github/scripts/validate-migration.py):
--   - client_id is TEXT (matches engagement_clients.id)
--   - columns referencing auth.users are UUID
--   - CREATE TABLE IF NOT EXISTS; RLS enabled
--
-- RLS mirrors the established generic_market_events pattern:
--   - reads/writes scoped to clients the caller can already see
--     (my_role() = 'super_coach' OR can_view_client(client_id))
--   - created_by_uid defaults to auth.uid() and INSERT forces it to the
--     caller, so it can never be spoofed by the browser.
-- ============================================================

-- ── 1) Deliveries ───────────────────────────────────────────
create table if not exists op_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  reference text,
  customer text,
  due_date date,
  delivered_at date,
  status text not null default 'pending' check (status in ('pending','delivered','delayed','cancelled')),
  notes text,
  handled_by text,                                  -- staff display name (feeds scorecards)
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_op_deliveries_client on op_deliveries(client_id);

alter table op_deliveries enable row level security;

drop policy if exists op_deliveries_read   on op_deliveries;
drop policy if exists op_deliveries_insert on op_deliveries;
drop policy if exists op_deliveries_update on op_deliveries;
drop policy if exists op_deliveries_delete on op_deliveries;

create policy op_deliveries_read on op_deliveries for select
  using (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_deliveries_insert on op_deliveries for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());

create policy op_deliveries_update on op_deliveries for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_deliveries_delete on op_deliveries for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));

-- ── 2) Complaints ───────────────────────────────────────────
create table if not exists op_complaints (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  customer text,
  category text,
  raised_at date not null default now(),
  resolved_at date,
  status text not null default 'open' check (status in ('open','resolved')),
  severity text,
  notes text,
  handled_by text,                                  -- staff display name (feeds scorecards)
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_op_complaints_client on op_complaints(client_id);

alter table op_complaints enable row level security;

drop policy if exists op_complaints_read   on op_complaints;
drop policy if exists op_complaints_insert on op_complaints;
drop policy if exists op_complaints_update on op_complaints;
drop policy if exists op_complaints_delete on op_complaints;

create policy op_complaints_read on op_complaints for select
  using (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_complaints_insert on op_complaints for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());

create policy op_complaints_update on op_complaints for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_complaints_delete on op_complaints for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));

-- ── 3) Manual staff scorecard rows ──────────────────────────
create table if not exists op_staff_scores (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  staff_name text,
  role text,
  period date,
  metric text,
  value numeric,
  notes text,
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_op_staff_scores_client on op_staff_scores(client_id);

alter table op_staff_scores enable row level security;

drop policy if exists op_staff_scores_read   on op_staff_scores;
drop policy if exists op_staff_scores_insert on op_staff_scores;
drop policy if exists op_staff_scores_update on op_staff_scores;
drop policy if exists op_staff_scores_delete on op_staff_scores;

create policy op_staff_scores_read on op_staff_scores for select
  using (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_staff_scores_insert on op_staff_scores for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());

create policy op_staff_scores_update on op_staff_scores for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));

create policy op_staff_scores_delete on op_staff_scores for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));
