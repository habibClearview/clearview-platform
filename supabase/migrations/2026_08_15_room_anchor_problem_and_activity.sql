-- ============================================================
-- THE ROOM IS ANCHORED TO A CHAIN, NOT ONLY TO A SERVICE.
-- 15 August 2026.
--
-- WHAT WAS WRONG. Accept could only ever INSERT. Answer all six of Tool 1's
-- questions and the room got six rows, each with one cell filled, because the
-- only thing accept knew about an answer was which service the room was on.
-- "What does that activity deliver?" has no meaning without the activity, so
-- with nowhere to put it accept made a new row and put it there alone.
--
-- The model says the session walks a chain:
--
--     service  ->  the problems it solves  ->  the activity that solves each
--                  ->  what it delivers, who pays, the assumption, the disproof
--
-- gtcv_room_state held the first link only. These two columns hold the other
-- two, so an answer to a question about an activity lands ON that activity.
--
-- Both are set as the room works: accepting a problem anchors it, accepting an
-- activity anchors that, and the facilitator can point either somewhere else
-- from the pending row before pressing Accept.
--
-- on delete set null throughout: parking or deleting the row the room was on
-- must never take the room's state with it. Accept then says what is missing
-- rather than writing into a row that is gone.
--
-- SAFE TO RUN TWICE.
-- ============================================================

alter table public.gtcv_room_state
  add column if not exists current_problem_id uuid
  references public.gtcv_problem_owner_budget(id) on delete set null;

alter table public.gtcv_room_state
  add column if not exists current_activity_id uuid
  references public.gtcv_assumptions(id) on delete set null;

comment on column public.gtcv_room_state.current_problem_id is
  'The problem the room is working through. An accepted activity is filed under it.';

comment on column public.gtcv_room_state.current_activity_id is
  'The activity the room is working through. An accepted delivers / who pays / assumption / disproof fills THIS row rather than making a new one.';
