-- ============================================================
-- GtCV session model and gate sign-off record.
--
-- WHY: the method is delivered as a fixed sequence of sessions, and the
-- sessions are not interchangeable. The Delivery Guide is explicit about who
-- is in the room for each one, and the room is part of the method rather than
-- an administrative detail:
--
--   * PLENARY sessions run with the whole client team present (the Zone 1
--     service listing plenary, the Zone 2 opening and validation debrief
--     plenaries, the Zone 3 testing debrief, the A/B debrief, the Zone 7
--     full debriefs, the Zone 8 pilot evidence review).
--   * JOINT WITH FUNDER sessions have the programme funder in the room: the
--     pre-engagement diagnostic ("LSP Executive Director and Board Chair,
--     the funder Country Representative, and the Lead Consultant present in
--     the same room"), and all three Commercial Readiness diagnostics
--     (baseline, mid point, close) plus the formal handover, which the guide
--     describes as joint sessions where the evidence is reviewed together
--     and the score is agreed.
--   * CLIENT TEAM ONLY sessions are worked with the leadership team without
--     the funder present (segment prioritisation, identity workshop, partner
--     mapping, pricing stress test).
--   * FINANCE RESTRICTED sessions are the DP04 cost mapping sessions. The
--     privacy protocol is explicit: "These sessions are held with the finance
--     team, HR representative, and leadership only. The full field team does
--     not attend the cost mapping sessions." The field team validates
--     delivery time separately and never sees cost totals.
--   * FIELD TEAM sessions are run with the delivery staff (customer
--     conversation training, fieldwork, delivery time validation, pilot
--     sessions).
--   * ONE TO ONE covers the drafting and review pairs the guide names
--     directly ("CI drafts, LC reviews") and the gate reviews ("LC leads, ED
--     signs").
--
-- The gate pattern the guide repeats at every zone close is
-- "co-implementer drafts, lead consultant reviews, Executive Director signs",
-- and the lead consultant is the only person who authorises the next zone to
-- open ("no zone opens until the previous gate is closed with documented
-- evidence"). The funder co-signs two records only: the pre-engagement
-- diagnostic record and the engagement completion record.
--
-- Three tables:
--   gtcv_sessions            -- the planned and held sessions per decision point
--   gtcv_session_attendance  -- who was required, and who actually attended
--   gtcv_gate_signoffs       -- signed / authorised / returned, per gate
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * signer_user_id is UUID and references auth.users(id).
--   * RLS reuses the established helpers: can_view_client(text) for read and
--     can_manage_client_access(text) for write, exactly as in
--     2026_08_09_gtcv_dp_tables_d.sql.
--   * Rules that are law (the session kinds, the three sign-off decisions,
--     one decision per signer role per gate) are constraints. Rules that are
--     judgement (which attendees a kind requires, whether a required attendee
--     was missing) are surfaced in the UI as warnings, so the coach sees the
--     gap and decides, rather than being blocked by a database error.
--
-- SAFE TO APPLY: additive only (create ... if not exists). Nothing existing
-- is dropped or altered. Apply to STAGING first, verify, then production.
--
-- Depends on: engagement_clients, engagement_parties, can_view_client(text)
-- and can_manage_client_access(text).
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_sessions -- one row per session in the delivery plan.
--    dp_id carries the decision point the session belongs to, using the
--    app's runtime values ('setup', 'phase_0', 'dp01'..'dp09', 'handover').
--    planned_date is what the plan says; held_date is what actually
--    happened, which is what the weekly progress report reports on
--    ("Date - session name - attendees present - duration").
-- ------------------------------------------------------------
create table if not exists gtcv_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  dp_id text,                      -- 'setup','phase_0','dp01'..'dp09','handover'
  title text,
  -- The room, which the method treats as part of the design.
  session_kind text check (session_kind in (
    'plenary','joint_with_funder','client_team_only','finance_restricted',
    'field_team','one_to_one'
  )),
  planned_date date,
  held_date date,
  duration_minutes int,
  status text not null default 'planned'
    check (status in ('planned','held','cancelled')),
  purpose text,                    -- what this session must produce
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_sessions_client on gtcv_sessions(client_id);
create index if not exists idx_gtcv_sessions_dp on gtcv_sessions(client_id, dp_id);

-- ------------------------------------------------------------
-- 2) gtcv_session_attendance -- who was required in the room and who was
--    actually there. party_id points at engagement_parties, which already
--    holds people without a login (a funder representative who only
--    receives and signs), so attendance covers everyone in the method.
--
--    party_role is denormalised alongside party_id so a required attendee
--    can be recorded for a role the engagement has not named a person for
--    yet, and so the row still reads correctly if the party is later
--    removed (party_id then nulls out).
--
--    required = true means the method requires this role for this session
--    kind. attended is left null until the session is held, so "not yet
--    recorded" is distinguishable from "did not attend".
-- ------------------------------------------------------------
create table if not exists gtcv_session_attendance (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  session_id uuid not null references gtcv_sessions(id) on delete cascade,
  party_id uuid references engagement_parties(id) on delete set null,
  party_role text,
  required boolean not null default false,
  attended boolean,
  created_at timestamptz not null default now()
);
create index if not exists idx_gtcv_session_attendance_client on gtcv_session_attendance(client_id);
create index if not exists idx_gtcv_session_attendance_session on gtcv_session_attendance(session_id);

-- ------------------------------------------------------------
-- 3) gtcv_gate_signoffs -- the sign-off record for a gate.
--
--    decision values, straight from the method:
--      'signed'     -- the Executive Director signs the decision output.
--                      The guide's pattern at every zone close is
--                      "CI drafts, LC reviews, ED signs". The funder
--                      co-signs the diagnostic record and the completion
--                      record, using this same decision.
--      'authorised' -- the lead consultant authorises the next zone to
--                      open. This is the gate itself, and the guide gives
--                      it to the lead consultant alone.
--      'returned'   -- the gate is sent back with the gap named, rather
--                      than closed. A returned gate leaves the next zone
--                      shut.
--
--    signer_user_id records who actually pressed the button, taken from the
--    authenticated session by /api/gate-signoff and never from the request
--    body. signer_role and signer_name carry the role that was signed in,
--    so the record still reads if the login is later removed.
--
--    The unique key is (client_id, dp_id, signer_role, decision): one
--    Executive Director signature per gate, one lead consultant
--    authorisation per gate, and a return recorded once per role. Repeating
--    an action updates the existing row rather than stacking duplicates.
-- ------------------------------------------------------------
create table if not exists gtcv_gate_signoffs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  dp_id text,                      -- the gate being signed
  signer_role text,                -- engagement_parties.party_role value
  signer_name text,
  signer_user_id uuid references auth.users(id),
  decision text check (decision in ('signed','authorised','returned')),
  note text,                       -- why it was returned, or what was signed
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, dp_id, signer_role, decision)
);
create index if not exists idx_gtcv_gate_signoffs_client on gtcv_gate_signoffs(client_id);
create index if not exists idx_gtcv_gate_signoffs_dp on gtcv_gate_signoffs(client_id, dp_id);

-- ------------------------------------------------------------
-- RLS: read for anyone who can view the client, write for whoever manages
-- the client. Both helpers already encapsulate the super_coach exception,
-- so the policies are identical across the three tables.
--
-- The Executive Director signs through /api/gate-signoff, which runs with
-- the service role after authenticating the caller and checking they can
-- view this client. That is deliberate: the ED can view the engagement but
-- does not manage it, so the write policy below would refuse the direct
-- insert. The route is the only path that records a sign-off.
--
-- policy coach_funder_read on gtcv_sessions: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_session_attendance: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_gate_signoffs: super_coach, assigned co-implementer, the client's own users and the funder.
-- ------------------------------------------------------------
alter table gtcv_sessions enable row level security;
alter table gtcv_session_attendance enable row level security;
alter table gtcv_gate_signoffs enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'gtcv_sessions','gtcv_session_attendance','gtcv_gate_signoffs'
  ]
  loop
    execute format('drop policy if exists coach_funder_read on %I', t);
    execute format('create policy coach_funder_read on %I for select using (can_view_client(client_id))', t);

    execute format('drop policy if exists coach_manage on %I', t);
    execute format(
      'create policy coach_manage on %I for all
         using (can_manage_client_access(client_id))
         with check (can_manage_client_access(client_id))', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- Grants. RLS still decides row visibility; these only allow the role to
-- reach the table at all.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.gtcv_sessions to authenticated;
grant select, insert, update, delete on public.gtcv_session_attendance to authenticated;
grant select, insert, update, delete on public.gtcv_gate_signoffs to authenticated;
