-- ============================================================
-- One version number per Charter per engagement.
--
-- Re-issuing reads the current version, supersedes it, and inserts the next.
-- Two people pressing Re-issue at the same moment both read version N and both
-- insert N + 1, and the engagement ends up with two version 2 drafts. Which one
-- the parties then sign is a coin toss, and the signatures on the other are
-- attached to wording nobody agreed.
--
-- The route guards the supersede on the status it read, which closes most of
-- the window. This closes it entirely, because the guard is a check-then-act
-- and the database is the only thing that can make the pair atomic.
--
-- Existing duplicates are renumbered rather than deleted. A duplicate version
-- is a real Charter somebody may have signed, and deleting it would delete the
-- record of that. The later row is pushed above the highest number in use.
-- ============================================================

do $$
declare
  dup record;
  next_version int;
begin
  for dup in
    select id, client_id
    from (
      select id, client_id, version,
             row_number() over (partition by client_id, version order by created_at, id) as seq
      from engagement_charters
    ) ranked
    where seq > 1
    order by client_id, version
  loop
    select coalesce(max(version), 0) + 1 into next_version
      from engagement_charters where client_id = dup.client_id;
    update engagement_charters set version = next_version where id = dup.id;
  end loop;
end $$;

create unique index if not exists engagement_charters_client_version
  on engagement_charters (client_id, version);
