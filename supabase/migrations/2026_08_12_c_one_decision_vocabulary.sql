-- ============================================================
-- ONE VOCABULARY FOR DECISIONS. (C29 as amended, 12 August 2026)
--
-- WHAT I GOT WRONG A FEW HOURS AGO. I added decision columns to the activity
-- and problem tables using the correction's own words — carry, kill, pause —
-- without noticing that the platform already had a decision vocabulary:
-- keep, redesign, pause, stop, on gtcv_service_inventory.decision.
--
-- The instruction, 12 August 2026: "Same decision, one column. Use the existing
-- decision on gtcv_service_inventory with its existing values keep, redesign,
-- pause, stop. Do not add a second column and do not introduce carry, kill,
-- pause as separate words."
--
-- That was asked about the service level. It applies just as much one level
-- down: a platform where an activity is "killed" and a service is "stopped"
-- is a platform where two words mean one thing, and somebody eventually writes
-- a report that counts them separately.
--
-- SO THE ITEM LEVEL USES THE SAME FOUR WORDS. The counter still SAYS killed,
-- paused and carried forward, because those are the words C30 puts on screen
-- and they are the right words for a room. What is stored underneath is the
-- platform's own vocabulary:
--
--     carried forward   keep
--     killed            stop
--     paused            pause
--     (also possible)   redesign, which counts as carried forward
--
-- Safe to change: these columns were added this morning and hold no data. The
-- count was run before writing this rather than assumed.
-- ============================================================

alter table gtcv_assumptions
  drop constraint if exists gtcv_assumptions_decision_check;
alter table gtcv_assumptions
  add constraint gtcv_assumptions_decision_check
  check (decision is null or decision in ('keep', 'redesign', 'pause', 'stop'));

alter table gtcv_problem_owner_budget
  drop constraint if exists gtcv_problem_owner_budget_decision_check;
alter table gtcv_problem_owner_budget
  add constraint gtcv_problem_owner_budget_decision_check
  check (decision is null or decision in ('keep', 'redesign', 'pause', 'stop'));

comment on column gtcv_assumptions.decision is
  'C29. The Tool 5 decision for this activity, in the platform vocabulary: keep, redesign, pause, stop. The counter displays these as carried forward, killed and paused.';

comment on column gtcv_problem_owner_budget.decision is
  'C29. The Tool 5 decision for this problem, in the same four words as everywhere else.';

-- The service level adds NOTHING. C29 as amended: "the service-level decision
-- is the existing decision field, and Tool 5 sets it." gtcv_service_inventory
-- .decision already exists and already holds it. Recorded here so that anybody
-- looking for a service-level decision column stops looking.
