-- ============================================================
-- SETTING A FLAGGED CLIENT ASIDE. 8 September 2026.
--
-- The Clients screen opens with "flagged this week": the financial model
-- clients whose latest health check reads as Needs attention or Watch. There
-- was no way to acknowledge one. A client who is amber for a reason the coach
-- already knows about sits at the top of the screen indefinitely, and a list
-- with a permanent resident stops being read at all, which is how a genuinely
-- new flag gets missed.
--
-- WHY A TIMESTAMP RATHER THAN A FLAG. "Dismissed" as a yes or no would hide
-- the client until somebody remembered to un-hide them, including through a
-- health check that says something worse. This records WHEN it was set aside,
-- and the flag is hidden only while that moment is later than the latest
-- health check. A new check brings the client straight back, which is the
-- honest behaviour: the coach acknowledged what they had read, not everything
-- that would ever be written.
--
-- Writes to this table are already restricted to the coaching team by
-- coaching_team_writes, so a client cannot set aside their own flag.
--
-- SAFE TO RUN TWICE.
-- ============================================================
alter table engagement_clients
  add column if not exists health_flag_dismissed_at timestamptz;

comment on column engagement_clients.health_flag_dismissed_at is
  'When the coach set this client''s health flag aside. The flag returns as soon as a health check newer than this is generated.';
