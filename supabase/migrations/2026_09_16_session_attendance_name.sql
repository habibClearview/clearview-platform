-- Who was in the session, kept in the session's own record. 16 September 2026.
--
-- Habib asked to pick participants from the people on the engagement, and that
-- is what gtcv_session_attendance now records: one row per person per session,
-- pointing at their engagement_parties row.
--
-- WHY A NAME AS WELL AS A POINTER. The pointer is set to null when somebody is
-- taken off the engagement (party_id references engagement_parties on delete
-- set null), so the attendance row survives with no identity on it at all. A
-- session record that cannot say who was in the room is not a record. People
-- do leave: a country representative moves on, a director is replaced, and the
-- recording of the conversation they were in is still the evidence behind a
-- signed decision.
--
-- So the name is written down at the moment they are added. The pointer stays
-- and is still preferred while it resolves, because a person who corrects the
-- spelling of their own name should see the correction. The stored name is
-- what is left when there is nothing to point at.
--
-- SAFE TO RUN TWICE. Additive only: one nullable column. Nothing existing is
-- dropped, altered or deleted, and rows written before this simply carry no
-- name, which is exactly what is known about them.
alter table gtcv_session_attendance
  add column if not exists party_name text;

comment on column gtcv_session_attendance.party_name is
  'The person''s name as it stood when they were added to the session. Read only when party_id no longer resolves, so that a session can always say who was in the room even after somebody leaves the engagement.';
