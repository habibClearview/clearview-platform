-- ============================================================
-- ATTENDANCE  [additive]
--
-- One record per staff member per day: present / late / absent. Backs the
-- HUMAN RESOURCES › Attendance register (manager-marked today), and is the
-- same table the future field-app SELF clock-in will write to — hence the
-- geo columns are here now, unused until that lands:
--   clock_in_at   the moment they tapped "I'm in" (system-stamped)
--   latitude/longitude, location_ok   proof-of-place at clock-in
--   source        'dashboard' (marked by a manager) | 'field' (self clock-in)
--
-- SAFE TO APPLY: additive + idempotent. Requires the `staff` table
-- (2026_07_28_staff.sql). RLS mirrors staff; explicit GRANT to authenticated
-- (RLS still scopes rows). Run in the Supabase SQL editor.
-- ============================================================

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id),
  staff_id uuid not null references staff(id) on delete cascade,
  day date not null,
  status text not null default 'present' check (status in ('present','late','absent')),
  clock_in_at timestamptz,                 -- future field-app self clock-in
  latitude double precision,
  longitude double precision,
  location_ok boolean,                     -- within range of the store (field app)
  source text not null default 'dashboard' check (source in ('dashboard','field')),
  notes text,
  created_by_uid uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One record per person per day (upsert target).
create unique index if not exists uq_attendance_staff_day on attendance (staff_id, day);
create index if not exists idx_attendance_client_day on attendance (client_id, day);

alter table attendance enable row level security;

drop policy if exists attendance_read   on attendance;
drop policy if exists attendance_insert  on attendance;
drop policy if exists attendance_update  on attendance;
drop policy if exists attendance_delete  on attendance;

create policy attendance_read on attendance for select
  using (my_role() = 'super_coach' or can_view_client(client_id));
create policy attendance_insert on attendance for insert
  with check ((my_role() = 'super_coach' or can_view_client(client_id)) and created_by_uid = auth.uid());
create policy attendance_update on attendance for update
  using (my_role() = 'super_coach' or can_view_client(client_id))
  with check (my_role() = 'super_coach' or can_view_client(client_id));
create policy attendance_delete on attendance for delete
  using (my_role() = 'super_coach' or can_view_client(client_id));

grant select, insert, update, delete on attendance to authenticated;
