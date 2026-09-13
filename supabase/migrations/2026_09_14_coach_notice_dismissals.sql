-- Setting aside a notice on the coach's own screens. 14 September 2026.
--
-- Habib: I should be able to dismiss or set aside any flag.
--
-- The client health flag already had this, on engagement_clients
-- (health_flag_dismissed_at, 2026_09_08). The notices on My Business are not
-- about one client, they are about a set of records: the Clearview data
-- capture submissions waiting to be reviewed, the timesheets waiting to be
-- approved. One row per notice, holding a short fingerprint of exactly which
-- records were set aside, so the notice comes back the moment that set
-- changes. See src/lib/notice-dismissal.ts for how the fingerprint is made.
--
-- This is stored in the database and not in the browser, deliberately. A
-- coach who sets a notice aside on their laptop has set it aside, not hidden
-- it on one machine, and nothing about the practice is left sitting in a
-- browser where it is neither protected by row-level security nor visible to
-- anyone reviewing what the platform holds.
create table if not exists coach_notice_dismissals (
  notice_key text primary key,
  covers text,
  dismissed_at timestamptz not null default now(),
  dismissed_by text
);

comment on table coach_notice_dismissals is
  'Notices the super coach has set aside on their own screens. covers is a fingerprint of the records set aside; when the live set no longer matches it, the notice is shown again.';
comment on column coach_notice_dismissals.covers is
  'Fingerprint of the ids that were set aside, from noticeFingerprint in src/lib/notice-dismissal.ts. Null means the notice is not set aside.';

alter table coach_notice_dismissals enable row level security;

-- The same boundary coach_letters uses, and for the same reason: this is the
-- super coach's own screen, and there is no practice, tenant or organisation
-- column anywhere in this schema to scope it more finely than that. If this
-- platform ever serves more than one practice, every coach-team table needs
-- scoping in the same change.
drop policy if exists super_coach_only on coach_notice_dismissals;
-- with check is spelled out rather than left to Postgres reusing using, so the
-- rule for writing is as plain to read as the rule for reading.
create policy super_coach_only on coach_notice_dismissals for all
  using (my_role() = 'super_coach')
  with check (my_role() = 'super_coach');
