-- ============================================================
-- DEPARTMENTS  (client-configurable)  [additive]
--
-- Each business names its OWN departments — Finance, Marketing, whatever
-- suits them — instead of a fixed two-value list. The Staff roster (HR) then
-- holds the whole company, grouped by these departments.
--
-- staff.department stays a TEXT holding the department NAME (so it always
-- matches a departments.name). We relax its old CHECK so any client-defined
-- name is allowed, and migrate the two internal codes to their display names.
--
-- `kind` is an OPTIONAL classifier the future KPI / sales-credit wiring uses:
--   sales   — the team that WINS customers (conversion metrics)
--   service — the team that SERVES sales (repeat-business metrics)
--   support — everyone else (own targets, no sales metrics)
-- It is not surfaced in the UI yet; the two seeded defaults are pre-tagged and
-- custom departments are left null until classified.
--
-- SAFE TO APPLY: additive + idempotent. New table + seed + relaxes one CHECK.
-- Requires the `staff` table (2026_07_28_staff.sql). Run in the Supabase SQL
-- editor.
--
-- Conventions: client_id TEXT; auth.users refs UUID; RLS mirrors staff;
-- explicit GRANT to authenticated (RLS still scopes rows).
-- ============================================================

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  name text not null,
  kind text check (kind in ('sales','service','support')),   -- optional; for future KPI wiring
  sort_order int not null default 0,
  active boolean not null default true,
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_departments_client_name on departments (client_id, lower(name));
create index if not exists idx_departments_client on departments (client_id, active);

alter table departments enable row level security;

drop policy if exists departments_read   on departments;
drop policy if exists departments_insert  on departments;
drop policy if exists departments_update  on departments;
drop policy if exists departments_delete  on departments;

create policy departments_read on departments for select
  using (my_role() = 'super_coach' or can_view_client(client_id));
create policy departments_insert on departments for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());
create policy departments_update on departments for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));
create policy departments_delete on departments for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));

grant select, insert, update, delete on departments to authenticated;

-- Seed two starter departments for every existing client (idempotent).
insert into departments (client_id, name, kind, sort_order)
  select id, 'Sales & Marketing', 'sales', 1 from engagement_clients
  on conflict (client_id, lower(name)) do nothing;
insert into departments (client_id, name, kind, sort_order)
  select id, 'Operations', 'service', 2 from engagement_clients
  on conflict (client_id, lower(name)) do nothing;

-- Relax the old 2-value CHECK FIRST — otherwise renaming the rows below to the
-- display names ("Sales & Marketing") would violate the still-active constraint.
-- Keep NOT NULL; refresh the default to a friendly name.
alter table staff drop constraint if exists staff_department_check;
alter table staff alter column department set default 'Sales & Marketing';

-- Now migrate existing staff from the internal codes to the display names so
-- they line up with departments.name.
update staff set department = 'Sales & Marketing' where department = 'sales_marketing';
update staff set department = 'Operations'        where department = 'operations';
