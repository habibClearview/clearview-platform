-- ============================================================
-- STAFF  (canonical people list)  [additive]
--
-- The single source of truth for the PEOPLE who work in a client's
-- business, with a stable per-client staff code. Today, staff identity is
-- fragmented across three unrelated representations:
--   * field_operators  (uuid) — field-app users who record sales
--   * user_profiles    (uuid) — platform logins (dashboard users)
--   * free-text names          — op_deliveries.handled_by,
--                                op_complaints.handled_by,
--                                op_staff_scores.staff_name,
--                                customer_leads.officer
-- None of these is a canonical roster, and the free-text names collide
-- (two "John"s look identical on a scorecard). This table fills that gap.
--
-- It anchors the two departments the businesses actually run:
--   * operations       — shopkeepers / till staff (the people who SERVE a
--                        sale). Measured on throughput + repeat business.
--   * sales_marketing  — the outbound team who RECRUIT customers (the
--                        people who SOURCE a customer). Measured on lead
--                        and prospect conversion.
-- Everything downstream (customer sourcing attribution, the recruitment
-- log, attendance, KPI scorecards) references staff.id.
--
-- A staff member need NOT be a platform login: a field agent with no
-- account still gets a row and a code. Where a staff member IS also a
-- field-app operator, field_operator_id links the two (nullable, optional).
--
-- SAFE TO APPLY: purely additive. One new table, indexes, RLS. Nothing
-- existing is altered or removed. Paste into the Supabase SQL editor and Run.
--
-- Conventions (.github/scripts/validate-migration.py):
--   - client_id is TEXT (matches engagement_clients.id)
--   - columns referencing auth.users are UUID
--   - CREATE TABLE IF NOT EXISTS; RLS enabled
--
-- RLS mirrors the established 2026_07_28_operations.sql pattern:
--   - reads/writes scoped to clients the caller can already see
--     (my_role() = 'super_coach' OR can_view_client(client_id))
--   - created_by_uid defaults to auth.uid() and INSERT forces it to the
--     caller, so it can never be spoofed by the browser.
-- ============================================================

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  staff_code text not null,                         -- stable, human-readable, unique per client
  full_name text not null,
  department text not null default 'sales_marketing'
    check (department in ('operations', 'sales_marketing')),
  phone text,
  active boolean not null default true,
  notes text,
  -- Targets are NOT stored on the person: these are growing businesses that
  -- raise targets monthly — sometimes weekly in season — and each past period
  -- must be graded against the target that applied AT THAT TIME, per metric.
  -- That history lives in `staff_targets` (2026_07_28_staff_targets.sql), one
  -- effective-dated row per target change. Keeping it separate is what makes
  -- the scorecards undisputable numbers rather than a single moving goalpost.
  field_operator_id uuid,                           -- optional link to field_operators.id (no FK: predates migrations)
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One code per person, per client (case-insensitive so "SM01" == "sm01").
create unique index if not exists uq_staff_client_code
  on staff (client_id, lower(staff_code));
-- Scorecards and pickers read by client, then filter by department/active.
create index if not exists idx_staff_client_dept
  on staff (client_id, department, active);

alter table staff enable row level security;

drop policy if exists staff_read   on staff;
drop policy if exists staff_insert  on staff;
drop policy if exists staff_update  on staff;
drop policy if exists staff_delete  on staff;

create policy staff_read on staff for select
  using (my_role() = 'super_coach' or can_view_client(client_id));

create policy staff_insert on staff for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());

create policy staff_update on staff for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));

create policy staff_delete on staff for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));
