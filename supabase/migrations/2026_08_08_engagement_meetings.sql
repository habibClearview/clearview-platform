-- ============================================================
-- GtCV: engagement_meetings -- the scheduling layer for an engagement.
--
-- WHY: an engagement runs on scheduled conversations (kickoff, the
-- validation conversations at DP02, gate reviews, the handover). This table
-- holds the proposed and confirmed meetings for a client, optionally tied to
-- the decision point the meeting serves (dp_id), so the journey map can show
-- what is coming and when.
--
-- CLIENT-AGNOSTIC: every meeting, purpose and time is data. Nothing here is
-- tied to any one client or person.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * dp_id is TEXT using the app's runtime values:
--       'setup' | 'phase_0' | 'dp01'..'dp09' | 'handover'. Nullable, since a
--     meeting need not map to a gate.
--   * user_id-style columns referencing auth.users are UUID.
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users, and the
--     programme funder) and can_manage_client_access(text) for write
--     (super_coach or the assigned co-implementer only).
--
-- SAFE TO APPLY: additive only (CREATE ... IF NOT EXISTS; new policies).
-- Nothing existing is dropped or altered. Apply to STAGING first, verify,
-- then production (see docs/STAGING_AND_ROLLBACK.md).
--
-- Depends on: can_view_client(text) and can_manage_client_access(text)
-- (2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- engagement_meetings -- one scheduled (or proposed) meeting for a client.
-- ────────────────────────────────────────────────────────────
create table if not exists engagement_meetings (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  title text,
  purpose text,
  -- The decision point this meeting serves, when it maps to one:
  -- 'setup'|'phase_0'|'dp01'..'dp09'|'handover'. NULL for a general meeting.
  dp_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  -- A physical location and/or a video link (either may be used).
  location text,
  meeting_url text,
  -- Lifecycle: proposed by the coach, confirmed with the parties, marked done
  -- after it happens, or cancelled.
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','done','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_engagement_meetings_client on engagement_meetings(client_id);

-- ────────────────────────────────────────────────────────────
-- RLS -- read for anyone who can view the client; write for whoever manages
-- the client (super_coach or the assigned co-implementer). Mirrors the
-- commercial-layer tables exactly.
-- ────────────────────────────────────────────────────────────
alter table engagement_meetings enable row level security;  -- super_coach via can_view_client/can_manage_client_access

drop policy if exists coach_funder_read on engagement_meetings;
create policy coach_funder_read on engagement_meetings for select
  using (can_view_client(client_id));

drop policy if exists coach_manage on engagement_meetings;
create policy coach_manage on engagement_meetings for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));
