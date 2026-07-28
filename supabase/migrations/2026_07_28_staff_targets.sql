-- ============================================================
-- STAFF TARGETS  (effective-dated target history)  [additive]
--
-- Targets change often in a growing business — raised monthly, sometimes
-- weekly during the season. A single number on the staff row cannot grade
-- last month against last month's goal. So each target change is its own
-- effective-dated row here, PER METRIC, and the scorecards read "the target
-- in force during period P" = the latest row with effective_from <= P for
-- that (staff, metric). Raising a target = insert a new row with a later
-- effective_from; the old row still governs the periods it covered. This is
-- what keeps performance review and promotion based on undisputable numbers.
--
-- Metrics are numeric and objective (no free-text "stories"):
--   Sales & Marketing
--     new_customers        count of customers this person sourced
--     lead_conversion      lead -> prospect conversion %
--     prospect_conversion  prospect -> client conversion %
--     sales_value          sales value from customers this person sourced
--   Operations
--     sales_value          value of sales this person served
--     sales_count          number of sales served
--     repeat_rate          % of served customers who came back
--     attendance_rate      % of days clocked in on time
--   custom                 a numeric target the business names itself
--
-- A person can hold several targets at once (e.g. new_customers AND
-- sales_value), each with its own independent history.
--
-- SAFE TO APPLY: purely additive. One new table, indexes, RLS. Requires the
-- `staff` table (2026_07_28_staff.sql) to exist first. Paste into the
-- Supabase SQL editor and Run.
--
-- Conventions: client_id TEXT; auth.users refs UUID; RLS mirrors
-- 2026_07_28_staff.sql (super_coach or can_view_client; insert forces
-- created_by_uid = auth.uid()).
-- ============================================================

create table if not exists staff_targets (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  staff_id uuid not null references staff(id) on delete cascade,
  metric text not null
    check (metric in (
      'new_customers','lead_conversion','prospect_conversion',
      'sales_value','sales_count','repeat_rate','attendance_rate','custom'
    )),
  metric_label text,                                -- required label when metric = 'custom'
  target_value numeric not null,
  period text not null default 'monthly'
    check (period in ('weekly','monthly','quarterly')),
  effective_from date not null default now(),       -- the target governs periods starting on/after this date
  notes text,
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- "Target in force for (staff, metric) at date D" reads by staff+metric,
-- newest effective_from first.
create index if not exists idx_staff_targets_staff_metric
  on staff_targets (staff_id, metric, effective_from desc);
create index if not exists idx_staff_targets_client
  on staff_targets (client_id);

alter table staff_targets enable row level security;

drop policy if exists staff_targets_read   on staff_targets;
drop policy if exists staff_targets_insert on staff_targets;
drop policy if exists staff_targets_update on staff_targets;
drop policy if exists staff_targets_delete on staff_targets;

create policy staff_targets_read on staff_targets for select
  using (my_role() = 'super_coach' or can_view_client(client_id));

create policy staff_targets_insert on staff_targets for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());

create policy staff_targets_update on staff_targets for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));

create policy staff_targets_delete on staff_targets for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));

-- Table-level GRANT for the logged-in role (see note in 2026_07_28_staff.sql).
-- RLS policies above still enforce client scoping.
grant select, insert, update, delete on staff_targets to authenticated;
