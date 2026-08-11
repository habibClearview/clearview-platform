-- ============================================================
-- CLOSING THE PUSH CHANNEL ON THE THREE ROOM TABLES.
--
-- WHAT WAS FOUND, on 11 August 2026, by scripts/check-push-channel.mjs run
-- from a machine that could finally reach the database host.
--
-- A browser holding ONLY the public key subscribed to the push channel and
-- received three messages: one for each of gtcv_questions, gtcv_submissions
-- and gtcv_room_state. The contents of the rows did not come with them — every
-- payload arrived empty, because the row filtering did its job — but the
-- messages themselves did. So a stranger holding the public key, which is in
-- every copy of the site, could tell that a workshop was running and when each
-- answer landed.
--
-- That is less than the answers themselves and it is still more than nothing.
-- Under Section 9 this system holds information about real organisations and
-- real named individuals, and when a room is answering is information about
-- them.
--
-- WHY REMOVING IT COSTS NOTHING. Nothing subscribes to this channel. The
-- earlier check could not be run at all, so the Participant Page and the
-- Facilitator View were built to take everything through a server route
-- holding the elevated key, and neither one opens a channel. The publication
-- entries were added by the Stage 1 migration on the same day in the
-- expectation that the screens would use them. They never did.
--
-- SO THIS UNDOES SOMETHING FROM THIS STAGE, not something that already
-- existed and works. If a later stage wants the push channel, it can be added
-- back deliberately, once somebody has decided what a holder of the public key
-- is allowed to learn.
--
-- The tables keep `replica identity full`. It costs nothing while they are out
-- of the publication and it is what makes an update legible if they are ever
-- put back.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gtcv_questions'
  ) then
    alter publication supabase_realtime drop table gtcv_questions;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gtcv_submissions'
  ) then
    alter publication supabase_realtime drop table gtcv_submissions;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gtcv_room_state'
  ) then
    alter publication supabase_realtime drop table gtcv_room_state;
  end if;
end $$;
