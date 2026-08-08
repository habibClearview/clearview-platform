-- ============================================================
-- GtCV: charter_comments -- the review-before-signature layer on the
-- Engagement Charter.
--
-- WHY: the Engagement Charter (engagement_charters + charter_signatures,
-- see 2026_08_08_gtcv_engagement_commercial_layer.sql) is reviewed by all
-- parties before anyone signs. The stage-two email tells recipients they
-- "can comment or suggest a change on any section before signing" (see
-- buildTriPartyEmail in src/lib/email.ts). This table is where those
-- comments and suggestions live, per charter section, until a manager
-- resolves each one (accept / decline / note).
--
-- CLIENT-AGNOSTIC: every author, section and body is data. Nothing here is
-- tied to any one client, party or engagement.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * user_id-style columns referencing auth.users are UUID.
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users, and
--     the programme funder) and can_manage_client_access(text) for the
--     manager actions (resolve/accept/decline). An authenticated reviewer
--     may additionally insert their own comment on a charter for a client
--     they can view (with check can_view_client(client_id)), so the client
--     ED or a funder rep with a login can leave feedback without being a
--     manager.
--
-- SAFE TO APPLY: additive only (CREATE ... IF NOT EXISTS; new policies).
-- Nothing existing is dropped or altered. Apply to STAGING first, verify,
-- then production (see docs/STAGING_AND_ROLLBACK.md).
--
-- Depends on: can_view_client(text) and can_manage_client_access(text)
-- (2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql), plus engagement_charters and
-- engagement_parties (2026_08_08_gtcv_engagement_commercial_layer.sql).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- charter_comments -- one comment or suggestion on a charter section,
-- with a resolution status a manager moves through.
-- ────────────────────────────────────────────────────────────
create table if not exists charter_comments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  charter_id uuid not null references engagement_charters(id) on delete cascade,
  -- Which section of the charter the comment is on (free text key, e.g.
  -- 'commercial_terms', 'responsibilities', a governance clause). NULL is a
  -- general comment on the charter as a whole.
  section_key text,
  -- The party who wrote it, when they are on the parties roster (nullable:
  -- set null on delete so the comment survives a roster change). name/role
  -- are captured too so the comment reads correctly even without a party row.
  author_party_id uuid references engagement_parties(id) on delete set null,
  author_name text,
  author_role text,
  -- A plain comment, or a concrete suggested change to the wording.
  kind text not null default 'comment' check (kind in ('comment','suggestion')),
  body text not null,
  -- Resolution lifecycle. A manager moves an open item to accepted (the
  -- change is taken up), declined (not taken up), or noted (acknowledged).
  status text not null default 'open' check (status in ('open','accepted','declined','noted')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_charter_comments_client on charter_comments(client_id);
create index if not exists idx_charter_comments_charter on charter_comments(charter_id);

-- ────────────────────────────────────────────────────────────
-- RLS -- read for anyone who can view the client; managers may do anything
-- (resolve/accept/decline); and an authenticated reviewer may insert their
-- own comment on a charter for a client they can view. Mirrors the pattern
-- on charter_signatures in the commercial-layer migration.
-- ────────────────────────────────────────────────────────────
alter table charter_comments enable row level security;  -- super_coach via can_view_client/can_manage_client_access

drop policy if exists coach_funder_read on charter_comments;
create policy coach_funder_read on charter_comments for select
  using (can_view_client(client_id));

drop policy if exists coach_manage on charter_comments;
create policy coach_manage on charter_comments for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

drop policy if exists author_self_insert on charter_comments;
create policy author_self_insert on charter_comments for insert
  with check (can_view_client(client_id));
