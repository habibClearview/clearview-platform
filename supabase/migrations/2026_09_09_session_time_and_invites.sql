-- ============================================================
-- A SESSION NEEDS A TIME, NOT ONLY A DAY. 9 September 2026.
--
-- Habib asked whether the planned session dates send a calendar invitation.
-- They could not, and the reason was in the table rather than in the code: a
-- session had a date and a length and no time of day. "3 March, 120 minutes"
-- is not something a calendar can hold, and an engagement running across
-- Nigeria, Kenya and the United Kingdom cannot be told "the morning".
--
-- planned_at is one absolute moment, so three people in three countries each
-- see it in their own time. A date alone cannot do that: 9am in Lagos is a
-- different moment from 9am in Nairobi, and the difference is a missed
-- session.
--
-- planned_date stays exactly as it is. Everything already written to it is
-- untouched and still read, and a session with no time is still a session with
-- a date; it simply cannot be sent as an invitation until somebody gives it
-- one.
--
-- invite_sent_at records that the invitation went, so the planner can say when
-- rather than leaving somebody to guess whether they sent it.
--
-- SAFE TO RUN TWICE.
-- ============================================================
alter table gtcv_sessions
  add column if not exists planned_at timestamptz,
  add column if not exists invite_sent_at timestamptz,
  -- Raised each time the invitation is sent. A calendar takes the higher
  -- number as the newer invitation and replaces the entry it already holds,
  -- which is what stops a changed time leaving two sessions in a diary.
  add column if not exists invite_sequence integer not null default 0;

-- A session that already carries a date keeps it. Nothing is invented: a date
-- without a time stays a date without a time, because guessing that every
-- session starts at nine in the morning would put a wrong time in somebody's
-- calendar, which is worse than no time at all.
