-- ============================================================
-- THE PROBLEM BELONGS TO THE SERVICE. THE ACTIVITY SOLVES THE PROBLEM.
-- 14 August 2026.
--
-- WHAT WAS WRONG. A problem hung off an ACTIVITY. So Tool 1 could not ask
-- "what problem does this service solve" — there was nowhere to put the
-- answer until an activity existed to hang it from — and Tool 2, which is
-- meant to open with Tool 1's problems already filled in, had nothing to
-- inherit but a list keyed to the wrong parent. Every row on the running
-- build read "No problem stated", six times over, which is that fault seen
-- from the outside.
--
-- WHAT THE SESSION ACTUALLY DOES, and what this makes possible:
--
--   An engagement has MANY services. The session walks them one at a time.
--   For each service:  the problem(s) it solves
--                        the activity that solves each problem
--                          what it delivers, who pays, the assumption held,
--                          and what would prove that assumption wrong
--
--   Tool 2 then takes those same problems, already there, and adds who owns
--   each one, the budget holder and the budget.
--
-- NOTHING IS DROPPED. activity_id stays on the problem table and keeps its
-- values. Two reasons: a column removed by surprise is how a screen goes
-- blank in front of a room, and the backfill below is derived FROM it — if
-- anything about the new shape proves wrong, the old shape is still there to
-- read. It can be dropped later, deliberately, once the tools have run a real
-- session on the new columns.
--
-- SAFE TO RUN TWICE. Every statement is guarded, and the two backfills only
-- touch rows that have no value yet.
-- ============================================================

-- ── The problem now names the service it belongs to ──────────
alter table public.gtcv_problem_owner_budget
  add column if not exists service_id uuid
  references public.gtcv_service_inventory(id) on delete set null;

-- ── The activity now names the problem it solves ─────────────
alter table public.gtcv_assumptions
  add column if not exists problem_id uuid
  references public.gtcv_problem_owner_budget(id) on delete set null;

-- Both tools filter by client and parent on every draw, so both get an index.
create index if not exists gtcv_problem_owner_budget_service_idx
  on public.gtcv_problem_owner_budget (client_id, service_id);

create index if not exists gtcv_assumptions_problem_idx
  on public.gtcv_assumptions (client_id, problem_id);

-- ── Backfill 1: a problem takes the service of the activity it
--    was hanging from, so nothing already stated is orphaned.
update public.gtcv_problem_owner_budget p
   set service_id = a.service_id
  from public.gtcv_assumptions a
 where p.activity_id = a.id
   and p.service_id is null
   and a.service_id is not null;

-- ── Backfill 2: the activity points at the problem that was
--    already pointing at it. The same relationship, read the
--    other way round, so no existing pairing is lost.
update public.gtcv_assumptions a
   set problem_id = p.id
  from public.gtcv_problem_owner_budget p
 where p.activity_id = a.id
   and a.problem_id is null;
