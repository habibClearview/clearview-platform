-- ============================================================
-- TOOL 1: MORE THAN ONE VALUE PER FIELD, AND A SERVICE THAT CAN BE PARKED
-- (T1.6, T1.21, T1.22)
--
-- T1.21: "On one activity, add a second value to who pays, a second to what it
-- delivers, a second to the assumption underneath, and a second to what would
-- prove it wrong. See: each field holding both values. The activity is still
-- one activity."
--
-- WHY A CHILD TABLE AND NOT FOUR ARRAY COLUMNS. Each value is a thing a room
-- says, removable on its own (T1.22), and orderable. A child row carries its
-- own identity so removing the second value cannot disturb the first, which is
-- exactly what T1.22 tests. Arrays would make "remove the second one" an index
-- calculation, and an index calculation against a list two people are editing
-- at once is how the wrong value gets deleted in front of a room.
--
-- THE FOUR ORIGINAL COLUMNS ARE NOT DROPPED, AND NOT RENAMED.
-- T1.23 forbids removing a column, and two other things already write to them:
--   src/lib/stage1-question-sets.ts   the room's own questions write here
--   app/api/facilitate/route.ts       its allowed-write list names all four
-- So the FIRST value of each field is mirrored back into the original column on
-- every write. Anything that reads gtcv_assumptions.who_pays keeps working and
-- keeps seeing a sensible answer. The child table is the truth for Tool 1; the
-- column is the truth for everything that has not been taught about the child
-- table. Nothing has to be migrated in a hurry, and nothing breaks meanwhile.
--
-- T1.6 also needs a service to be PARKABLE, which it never was: only activities
-- and problems could be parked. "Park: see the service and everything in it
-- move to the Parked area, recoverable."
-- ============================================================

-- ------------------------------------------------------------
-- 1) A service can be parked. Recoverable, never destroyed.
-- ------------------------------------------------------------
alter table gtcv_service_inventory
  add column if not exists parked_at timestamptz;

comment on column gtcv_service_inventory.parked_at is
  'T1.6. Park is the removal that keeps everything. The service and its activities move to the Parked area and come back complete.';

-- ------------------------------------------------------------
-- 2) The values of an activity, one row per value.
-- ------------------------------------------------------------
create table if not exists gtcv_activity_values (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  activity_id uuid not null references gtcv_assumptions(id) on delete cascade,
  -- The four fields that hold more than one answer. Named, not free, so a typo
  -- cannot invent a fifth field that no screen draws.
  field text not null check (field in ('delivers', 'who_pays', 'assumption', 'disproof')),
  value text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gtcv_activity_values_activity_idx
  on gtcv_activity_values (activity_id, field, sort_order);
create index if not exists gtcv_activity_values_client_idx
  on gtcv_activity_values (client_id);

alter table gtcv_activity_values enable row level security;
drop policy if exists gtcv_activity_values_view on gtcv_activity_values;
create policy gtcv_activity_values_view on gtcv_activity_values
  for select using (can_view_client(client_id));
drop policy if exists gtcv_activity_values_manage on gtcv_activity_values;
create policy gtcv_activity_values_manage on gtcv_activity_values
  for all using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

comment on table gtcv_activity_values is
  'T1.21, T1.22. One row per value, so a field can hold several and one can be removed without disturbing the rest. The first value of each field is mirrored into the matching column on gtcv_assumptions for everything that reads those columns.';

-- ------------------------------------------------------------
-- 3) BACKFILL. Everything already typed becomes the first value.
--
-- Nothing is moved and nothing is cleared: the column keeps its text and the
-- child table gains a copy. Run twice and it does not duplicate, because of the
-- not-exists guard, so this is safe to re-apply.
-- ------------------------------------------------------------
insert into gtcv_activity_values (client_id, activity_id, field, value, sort_order)
select a.client_id, a.id, f.field, f.value, 0
from gtcv_assumptions a
cross join lateral (values
  ('delivers',   a.delivers),
  ('who_pays',   a.who_pays),
  ('assumption', a.assumption),
  ('disproof',   a.disproof)
) as f(field, value)
where coalesce(btrim(f.value), '') <> ''
  and not exists (
    select 1 from gtcv_activity_values v
    where v.activity_id = a.id and v.field = f.field
  );
