-- ============================================================
-- GtCV working surfaces, set C: the DP05 A/B message test log, the DP05
-- pipeline tracker, and the DP07 pilot capture record.
--
-- WHY: DP05 (Market Entry Design) and DP07 (Pilot Design and Execution) are
-- the two gates where the method asks the organisation to run something real
-- and record what happened. Until now that evidence lived in workbooks off
-- the platform, so the coach could not see it, compare it, or gate on it.
-- These three tables give each of those method artefacts a home:
--
--   gtcv_ab_tests       one row per contact in an A/B message test. The
--                       method rule: the winning variant needs about 50
--                       percent higher response than the other. The app
--                       computes the response rate per variant and flags the
--                       winner; the table only stores what was observed.
--   gtcv_pipeline       one row per prospect, moving through the five method
--                       stages in order: Identified, Contacted, Met,
--                       Proposal Sent, Closed.
--   gtcv_pilot_sessions one row per pilot session. DP07 runs two iterations
--                       with two real paying clients each. Iteration 1 is
--                       coach led with the organisation observing; iteration
--                       2 is organisation led with the coach as backstop.
--                       Each session has three phases: pre-session brief,
--                       live observation, post-session debrief. The five
--                       observation dimensions are Engagement, Language,
--                       Resistance, Surprise and The Price Moment, each with
--                       its own note column.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users, the
--     programme funder) and can_manage_client_access(text) for write
--     (super_coach or the assigned co-implementer only).
--   * Every new table gets explicit grants to the authenticated role; RLS
--     is what actually restricts the rows.
--
-- CLIENT AGNOSTIC: no organisation, person, price or currency is baked in.
-- Every value is data entered against a client_id.
--
-- SAFE TO APPLY: additive only (create ... if not exists, new policies).
-- Nothing existing is dropped or altered. Apply to STAGING first (see
-- docs/STAGING_AND_ROLLBACK.md), verify, then production.
--
-- Depends on: can_view_client(text) and can_manage_client_access(text)
-- (2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql). Run those first if not applied.
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_ab_tests -- DP05 A/B message testing log. One row per contact
--    approached, recording which message variant they were sent and what
--    came back. Response rate per variant and the winner are computed in
--    the app (src/components/gtcv/ABTestingLog.tsx), never stored, so the
--    log stays the single source of truth.
-- ------------------------------------------------------------
create table if not exists gtcv_ab_tests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- Who was approached.
  contact_name text,
  organisation text,
  -- Which message variant went out.
  variant text not null default 'A' check (variant in ('A','B')),
  -- What came back. 'partial' counts as a response for the response rate.
  response text not null default 'no' check (response in ('yes','no','partial')),
  -- How good the response was, 1 (weak) to 5 (strong). Null until answered.
  response_quality int check (response_quality between 1 and 5),
  -- The words they used back. Language is evidence at DP05.
  key_phrase text,
  -- Did the reply carry a purchasing signal.
  purchasing_signal text not null default 'unsure'
    check (purchasing_signal in ('yes','no','unsure')),
  contact_date date,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_gtcv_ab_tests_client on gtcv_ab_tests(client_id);

-- ------------------------------------------------------------
-- 2) gtcv_pipeline -- DP05 pipeline tracker. One row per prospect. The five
--    stages are the method's own, in order, and the check constraint keeps
--    the vocabulary fixed so the stage count strip in the app is reliable.
-- ------------------------------------------------------------
create table if not exists gtcv_pipeline (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  organisation text,
  contact_name text,
  contact_role text,
  -- The five method stages, in order.
  stage text not null default 'identified'
    check (stage in ('identified','contacted','met','proposal_sent','closed')),
  value_estimate numeric,
  value_currency text default 'USD',
  last_action text,
  next_action text,
  next_action_date date,
  owner text,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_gtcv_pipeline_client on gtcv_pipeline(client_id);

-- ------------------------------------------------------------
-- 3) gtcv_pilot_sessions -- DP07 pilot capture. One row per pilot session,
--    tagged with its iteration (1 or 2) and which of the two paying clients
--    it belongs to (1 or 2), so the method's 2 x 2 shape is enforceable and
--    the iteration comparison can be computed.
--
--    Columns are grouped by the three phases of a pilot session.
-- ------------------------------------------------------------
create table if not exists gtcv_pilot_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- Two iterations, two real paying clients each.
  iteration int not null default 1 check (iteration in (1,2)),
  client_number int not null default 1 check (client_number in (1,2)),
  -- The paying client this session was run with, and when.
  pilot_client_label text,
  session_date date,
  session_title text,

  -- Phase 1: pre-session brief.
  hypothesis text,              -- the hypothesis this session tests
  price_tier text,              -- the price tier offered
  who_leads text,               -- iteration 1: the coach. iteration 2: the organisation.
  who_observes text,            -- iteration 1: the organisation. iteration 2: the coach, as backstop.

  -- Phase 2: live observation. The five method dimensions, one note each,
  -- plus what the client actually said and the signals that surfaced.
  obs_engagement text,
  obs_language text,
  obs_resistance text,
  obs_surprise text,
  obs_price_moment text,
  verbatim_responses text,
  purchasing_signals text,

  -- Phase 3: post-session debrief.
  close_type text check (close_type in ('genuine','polite','none')),
  viability int check (viability between 1 and 5),
  what_surprised_us text,
  revision_recommended text,
  key_learning text,

  notes text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_gtcv_pilot_sessions_client on gtcv_pilot_sessions(client_id);

-- ------------------------------------------------------------
-- RLS: read for anyone who can view the client, write for whoever manages
-- it. Both helpers already encapsulate the super_coach exception, so the
-- policies below are identical to the rest of the GtCV layer.
--
-- policy coach_funder_read on gtcv_ab_tests: super_coach, co-implementer,
--   client users and the programme funder read via can_view_client.
-- policy coach_manage on gtcv_ab_tests: super_coach and the assigned
--   co-implementer write via can_manage_client_access.
-- policy coach_funder_read on gtcv_pipeline: super_coach, co-implementer,
--   client users and the programme funder read via can_view_client.
-- policy coach_manage on gtcv_pipeline: super_coach and the assigned
--   co-implementer write via can_manage_client_access.
-- policy coach_funder_read on gtcv_pilot_sessions: super_coach,
--   co-implementer, client users and the funder read via can_view_client.
-- policy coach_manage on gtcv_pilot_sessions: super_coach and the assigned
--   co-implementer write via can_manage_client_access.
-- ------------------------------------------------------------
alter table gtcv_ab_tests enable row level security;
alter table gtcv_pipeline enable row level security;
alter table gtcv_pilot_sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gtcv_ab_tests','gtcv_pipeline','gtcv_pilot_sessions']
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
-- Grants. RLS decides which rows; these decide that the signed in role may
-- reach the table at all.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.gtcv_ab_tests to authenticated;
grant select, insert, update, delete on public.gtcv_pipeline to authenticated;
grant select, insert, update, delete on public.gtcv_pilot_sessions to authenticated;
