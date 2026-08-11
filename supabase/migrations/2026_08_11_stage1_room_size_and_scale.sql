-- ============================================================
-- STAGE 1, amendments of 11 August 2026.
--
-- ROOM SIZE (amendment to R25). The number of people in the room is a number
-- the facilitator sets, not one the system counts. A phone that locks or a tab
-- that sleeps would drop out of a counted total, so the denominator would move
-- on its own while a question was running, and "7 of 9" would not tell you
-- whether two people had not answered or two phones had gone to sleep. Only the
-- person standing in the room knows the right number.
--
-- Null means the facilitator has not set one. The counter then shows the number
-- of answers with no denominator, which is a correct state and not a failure.
--
-- THE SCALE OF A SCORE QUESTION. R16 shows the distribution, and a value nobody
-- chose must still appear at zero, in the same way an unchosen classify option
-- does: nobody choosing 1 is a finding, and a missing column hides it. That
-- needs the question to know what its scale runs from and to, so the screen can
-- show every value rather than only the values that came back.
-- ============================================================

alter table gtcv_room_state
  add column if not exists room_size int
  check (room_size is null or room_size >= 0);

comment on column gtcv_room_state.room_size is
  'How many people the facilitator says are in the room. Null means not set, and the counter then shows answers with no denominator.';

alter table gtcv_questions
  add column if not exists scale_min int not null default 1;
alter table gtcv_questions
  add column if not exists scale_max int not null default 5;

alter table gtcv_questions
  drop constraint if exists gtcv_questions_scale_order;
alter table gtcv_questions
  add constraint gtcv_questions_scale_order check (scale_max > scale_min);

comment on column gtcv_questions.scale_min is
  'Lowest value a score question offers. Every value from here to scale_max is shown in the distribution, including those nobody chose.';
