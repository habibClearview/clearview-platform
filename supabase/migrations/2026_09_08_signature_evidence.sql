-- ============================================================
-- WHAT WAS SIGNED, AND FROM WHERE.  8 September 2026.
--
-- charter_signatures already records who signed, in what capacity, by which
-- method, when, and against which charter version, and the version cannot be
-- edited once issued. That is a genuine electronic signature.
--
-- What it could not do is prove WHAT was signed or FROM WHERE. A signature row
-- that cannot name the bytes it was given is a claim, not evidence, and the
-- first time it matters will be the time somebody disputes the wording.
--
-- Three columns close that:
--   ip_address     -- where the signature came from
--   user_agent     -- what it was made on
--   content_sha256 -- a hash of the exact wording at the moment of signing
--
-- Reproduce the wording later, hash it again, and either it matches or the
-- document changed.
--
-- Until this can be run, /api/charter-sign writes all three into
-- admin_audit_log under action 'charter.signed', so no signature taken in the
-- meantime is missing its evidence. Once this is applied, the route should
-- write both, and the audit log stays as the independent second record.
--
-- SAFE TO RUN TWICE.
-- ============================================================

alter table charter_signatures add column if not exists ip_address     text;
alter table charter_signatures add column if not exists user_agent     text;
alter table charter_signatures add column if not exists content_sha256 text;

comment on column charter_signatures.content_sha256 is
  'SHA-256 over {title, version, content} of the charter version as stored at the moment of signing.';

-- WHO OPENED IT, AND WHEN. "Issued on the 3rd, opened by procurement on the
-- 4th, signed on the 5th" is the sentence that makes a funder trust the
-- record. Without it the platform knows only the last step.
create table if not exists charter_views (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references engagement_charters(id) on delete cascade,
  client_id  text not null references engagement_clients(id) on delete cascade,
  party_id   uuid references engagement_parties(id) on delete set null,
  viewer_user_id uuid references auth.users(id) on delete set null,
  viewer_email text,
  charter_version int,
  viewed_at timestamptz not null default now()
);
create index if not exists idx_charter_views_charter on charter_views(charter_id);
create index if not exists idx_charter_views_client  on charter_views(client_id);

alter table charter_views enable row level security;

-- Read for anyone who can view the client; written by the service role only,
-- so a viewer cannot forge somebody else's view.
drop policy if exists charter_views_read on charter_views;
create policy charter_views_read on charter_views
  for select using (can_view_client(client_id));
