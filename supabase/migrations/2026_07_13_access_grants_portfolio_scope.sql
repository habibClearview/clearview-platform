-- ============================================================
-- Clearview: external access grants -- portfolio/segment scope +
-- email confirmation.
--
-- Extends client_access_grants (2026_07_13_client_access_grants.sql) to
-- cover the two other things a coach needs to hand an external party
-- (investor, programme officer, DFI, subscriber): a read-only view of
-- the WHOLE portfolio, or of one FILTERED SEGMENT of it -- not just a
-- single client's Investment Brief. Matches the Product Development
-- Specification §5.4 ("a time-limited, read-only link to a specific
-- filtered view can be generated and shared with a programme director
-- or investor who does not have a ClearView account").
--
-- Also required: the recipient must confirm the email address the
-- coach entered before anything is revealed -- a real (if partial)
-- answer to "what stops this link being forwarded to anyone." It
-- doesn't stop someone forwarding the FILE after they've legitimately
-- received it (nothing can), but it stops a bare, passed-around link
-- from working for a stranger, and gives the coach a real record of
-- who actually used it instead of nothing.
--
-- SAFE TO APPLY: additive only. client_id becomes nullable (a portfolio-
-- or segment-scoped grant has no single client), which is a widening
-- constraint change, not a narrowing one -- every existing row already
-- has a non-null client_id and keeps working exactly as before, all
-- with scope_type defaulted to 'client'. Paste into the Supabase SQL
-- editor and Run.
-- ============================================================

alter table client_access_grants alter column client_id drop not null;
alter table client_access_grants add column if not exists scope_type text not null default 'client';  -- client | portfolio | segment
alter table client_access_grants add column if not exists segment_filter jsonb;  -- SegmentFilter shape, only meaningful when scope_type = 'segment'
alter table client_access_grants add column if not exists email_confirmed_at timestamptz;  -- set the first time the recipient's entered email matches grantee_email

-- A portfolio/segment grant has no client_id to scope can_view_client()/
-- can_manage_client_access() against -- those checks only make sense for
-- scope_type = 'client'. Widen both existing RLS policies so a
-- portfolio/segment grant (client_id is null) is visible/manageable by
-- super_coach only, exactly matching the same restriction already placed
-- on /api/portfolio-intelligence itself (Product Development
-- Specification §5.1 -- portfolio-level access is Habib's own tool).
drop policy if exists coach_funder_read on client_access_grants;
create policy coach_funder_read on client_access_grants for select
  using (case when client_id is null then my_role() = 'super_coach' else can_view_client(client_id) end);

drop policy if exists coach_manage on client_access_grants;
create policy coach_manage on client_access_grants for all
  using (case when client_id is null then my_role() = 'super_coach' else can_manage_client_access(client_id) end)
  with check (case when client_id is null then my_role() = 'super_coach' else can_manage_client_access(client_id) end);
