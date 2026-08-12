-- ============================================================
-- CORRECTION, PART A AND PART B. THE SERVICE IS THE ANCHOR. (C1 to C19)
--
-- THE HIERARCHY ALREADY HAS TABLES. It does not have the joins that make it a
-- hierarchy, and it has no way to say "this was removed but not destroyed".
-- That is what this adds. Nothing is renamed, nothing is dropped, and every
-- column added is nullable, so every row that exists today still reads exactly
-- as it did.
--
--   Service   gtcv_service_inventory     already the record C1 describes
--   Activity  gtcv_assumptions           already carries service_id
--   Problem   gtcv_problem_owner_budget  carries nothing yet — this adds it
--
-- WHY NOT NEW TABLES. Because the room's work is already in these ones. A new
-- set of tables would mean either migrating live engagement data, which is the
-- riskiest thing anybody could do to a record gathered under donor funding, or
-- leaving two versions of the truth. Section 4 protects these tables from being
-- renamed and reshaped; it does not stop them being joined up.
-- ============================================================

-- ------------------------------------------------------------
-- C1. A Service holds its name, whether it is current, redesigned or new, and
-- its decision state.
--
-- The name and the decision are already there: service_name, and decision with
-- keep / redesign / pause / stop. Only the first is missing, and it is a
-- different thing from the decision. "Redesigned" describes what the service
-- IS; "redesign" describes what the room decided to DO about it. A service can
-- be new and still be stopped.
-- ------------------------------------------------------------
alter table gtcv_service_inventory
  add column if not exists service_state text
  check (service_state is null or service_state in ('current', 'redesigned', 'new'));

comment on column gtcv_service_inventory.service_state is
  'C1. Whether this service is current, redesigned or new. Set by the facilitator and changeable at any time (C19). Separate from decision, which is what the room decided to do about it.';

-- ------------------------------------------------------------
-- C2 AND C7 TOGETHER. An Activity belongs to exactly one Service, and the
-- parked bucket is the only place one exists without one.
--
-- So a null service_id means parked, and parked_at says it was a decision
-- rather than an accident. That distinction matters because rows already exist
-- with no service, from before any of this: they were never parked, they were
-- simply written before services were the anchor. They appear in the bucket so
-- nothing is lost and nothing is quietly deleted, and their parked_at stays
-- empty, which is honest — nobody parked them.
--
-- C2's refusal of an orphan is enforced where creation happens, not by a NOT
-- NULL constraint here. A constraint would refuse the rows that already exist
-- and take a live engagement down to enforce a rule about new ones.
-- ------------------------------------------------------------
alter table gtcv_assumptions
  add column if not exists parked_at timestamptz;

comment on column gtcv_assumptions.parked_at is
  'C15. When this activity was parked. A null service_id with no parked_at is a row written before services were the anchor; it shows in the bucket too, and nothing about it is changed.';

-- C29 and C30. What the room decided about this activity, and therefore which
-- column of the counter it falls in.
alter table gtcv_assumptions
  add column if not exists decision text
  check (decision is null or decision in ('carry', 'kill', 'pause'));

comment on column gtcv_assumptions.decision is
  'C29. The Tool 5 decision for this activity: carried forward, killed or paused. Null means not yet decided, which is what Tool 5 exists to resolve.';

-- ------------------------------------------------------------
-- C3, C25, C26, C27. A Problem belongs to exactly one Activity.
--
-- THIS IS WHAT MAKES THE CARRY FORWARD REAL. C25 says every problem stated in
-- Tool 1 appears in Tool 2 with nothing retyped, and C27 says editing it in one
-- changes it in the other. Both are only true if there is ONE record shown in
-- two places. So a problem stated in Tool 1 IS a row in this table, from the
-- moment it is typed, and Tool 1 shows its parent's children rather than
-- holding a copy of the words.
--
-- Nullable, because rows already exist here that were entered before Tool 1
-- fed them. Those keep working and are shown as belonging to no activity yet,
-- rather than being hidden or guessed at.
-- ------------------------------------------------------------
alter table gtcv_problem_owner_budget
  add column if not exists activity_id uuid
  references gtcv_assumptions(id) on delete cascade;

comment on column gtcv_problem_owner_budget.activity_id is
  'C3. The activity this problem belongs to. Deleting the activity takes its problems with it, which is what C13 means by leaving nothing behind. Null on rows written before Tool 1 fed this table.';

create index if not exists gtcv_problem_owner_budget_activity_idx
  on gtcv_problem_owner_budget (activity_id);

-- C15. Problems park with their activity, and can be parked on their own.
alter table gtcv_problem_owner_budget
  add column if not exists parked_at timestamptz;

alter table gtcv_problem_owner_budget
  add column if not exists decision text
  check (decision is null or decision in ('carry', 'kill', 'pause'));

-- ------------------------------------------------------------
-- C14. Moving an activity to another service must carry everything with it.
--
-- Nothing is needed here for that, and the absence is the point: the problems
-- hang off the activity, not off the service, so moving the activity moves them
-- by not touching them. A model where problems also carried a service_id would
-- be a model where a move could leave them behind. That is the whole reason
-- the join is where it is.
-- ------------------------------------------------------------

-- C5. Which service the block is currently working on. One per engagement,
-- because the facilitator drives one room.
alter table gtcv_room_state
  add column if not exists current_service_id uuid
  references gtcv_service_inventory(id) on delete set null;

comment on column gtcv_room_state.current_service_id is
  'C5. The service every tool in the block is currently showing. Changing it changes all five tools at once, and C6 puts its name on the participant page.';
