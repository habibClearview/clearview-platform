-- ============================================================
-- R23. THE AGREED VALUE, AND THE DISTRIBUTION THAT IS KEPT BESIDE IT.
--
-- R23 says the agreed value from a score or classify question writes to the
-- table field, and that the full distribution is stored alongside it and can
-- be viewed later by clicking the value. The second half is the part that is
-- easy to lose: once a number is in a field, the six people who disagreed
-- about it have vanished, and the room's disagreement is the thing this whole
-- stage exists to keep.
--
-- SO THE DISTRIBUTION IS WRITTEN DOWN, NOT DERIVED. It is a snapshot taken at
-- the moment of reveal, not a query run later. Answers can be discarded, a
-- question can be re-run with a different room, and a count recomputed next
-- month would not be the count the room saw. What is stored is what was on the
-- wall when the decision was made.
--
-- WHAT THE AGREED VALUE IS (Q6, answered 11 August 2026). The facilitator sets
-- it after the reveal. It is never calculated: no average, no median, nothing
-- pre-filled. The distribution is the discussion and the value is the decision
-- the room reaches, and a pre-filled number would make the decision before the
-- discussion had it.
--
-- WHERE IT LANDS. A question may name one column of the block's own table, and
-- one row of that table, and the value is written there as well. Where it names
-- none, the value and the distribution still live here, so nothing is lost.
-- Two of the four Clearing the ground questions are in that position, because
-- gtcv_assumptions has no column that a "how likely" score or a "signal or
-- story" judgement belongs in. Recorded in PROGRESS.md rather than invented.
--
-- Nothing existing is touched. Four new columns on a table created this stage.
-- ============================================================

alter table gtcv_questions
  add column if not exists agreed_value text;

-- The column of the block's table this question's agreed value writes to, and
-- the heading shown above it. Null on a question that has no home column.
alter table gtcv_questions
  add column if not exists agreed_column text;

-- Which row of the block's table the value was written to. Text rather than a
-- reference, because different blocks write to different tables and a single
-- foreign key cannot point at more than one of them.
alter table gtcv_questions
  add column if not exists agreed_row_id text;

-- The counts as the room saw them, taken at the moment of reveal.
alter table gtcv_questions
  add column if not exists agreed_distribution jsonb;

alter table gtcv_questions
  add column if not exists agreed_at timestamptz;

-- ------------------------------------------------------------
-- R21. Which existing row a pending answer was merged into.
--
-- Merging does NOT overwrite the row it merges into. The row already says what
-- it says; the merge is the statement that the room said the same thing again,
-- and that the answer was dealt with rather than ignored. Keeping the link
-- means the count of people who said a thing survives the merge, which is the
-- whole point of R22's "submitted by 4".
-- ------------------------------------------------------------
alter table gtcv_submissions
  add column if not exists merged_into_row_id text;

comment on column gtcv_submissions.merged_into_row_id is
  'The row of the block table this answer was folded into. The row is not overwritten; this records that the room said the same thing again.';

comment on column gtcv_questions.agreed_value is
  'What the room agreed after seeing the distribution. Set by the facilitator, never calculated.';
comment on column gtcv_questions.agreed_distribution is
  'The counts as they stood at the reveal. A snapshot, not a query, so a later change to the answers cannot rewrite what the room decided on.';
