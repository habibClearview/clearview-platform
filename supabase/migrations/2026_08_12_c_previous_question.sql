-- ============================================================
-- C43. FINISHING AN ANSWER AFTER THE FACILITATOR HAS MOVED ON.
--
-- A late answer is accepted only where the participant had THAT question on
-- screen when it closed, and never after it was revealed. To decide that, the
-- room has to remember which question it just left and whether that one had
-- been revealed. Two columns, set at the moment a new question opens.
-- ============================================================
alter table gtcv_room_state
  add column if not exists previous_question_id uuid
  references gtcv_questions(id) on delete set null;

alter table gtcv_room_state
  add column if not exists previous_revealed boolean not null default false;

comment on column gtcv_room_state.previous_question_id is
  'C43. The question the room has just left. An answer to it is still accepted, once, unless it had been revealed.';
