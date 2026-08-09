-- ============================================================
-- One attendance row per person per session.
--
-- Setting the required attendees for a room reads what is already recorded and
-- inserts what is missing. Two room changes in quick succession both read the
-- same list and both inserted, so a session ended up requiring the same person
-- twice and the attendance count was wrong.
--
-- Reading first narrows the window. Closing it is the database's job, so this
-- is what actually guarantees it. Two indexes rather than one, because a role
-- with nobody named yet is recorded with a null party_id and nulls do not
-- collide in an ordinary unique index:
--
--   a named person appears once per session
--   an unnamed role appears once per session
--
-- Existing duplicates are collapsed to the earliest row first, keeping any
-- attendance that was already ticked.
-- ============================================================

update gtcv_session_attendance a
  set attended = true
  from gtcv_session_attendance b
  where a.session_id = b.session_id
    and a.party_id is not distinct from b.party_id
    and a.party_role is not distinct from b.party_role
    and b.attended = true
    and a.attended is distinct from true;

delete from gtcv_session_attendance a
  using gtcv_session_attendance b
  where a.session_id = b.session_id
    and a.party_id is not distinct from b.party_id
    and a.party_role is not distinct from b.party_role
    and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists gtcv_attendance_one_per_party
  on gtcv_session_attendance (session_id, party_id)
  where party_id is not null;

create unique index if not exists gtcv_attendance_one_per_role
  on gtcv_session_attendance (session_id, party_role)
  where party_id is null;
