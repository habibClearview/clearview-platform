-- ============================================================
-- GtCV working surfaces, set D: the Phase 0 tools and the DP09
-- Commercial Readiness Diagnostic.
--
-- WHY: Phase 0 ("clear the ground") and DP09 (readiness) are worked on
-- paper today. These six tables give them a real home so the coach and the
-- organisation edit the same rows, and so the gate evidence is queryable
-- instead of living in a workbook.
--
-- Phase 0 has five tools, used in this order (Handbook, Phase 0):
--   1. Assumption Dump Canvas        -> gtcv_assumptions
--   2. Problem Owner Budget Matrix   -> gtcv_problem_owner_budget
--   3. Hypothesis Shortlist Board    -> gtcv_hypotheses_shortlist
--   4. Signal vs Story Board         -> gtcv_signal_story
--   5. Continue / Pause / Kill Table -> gtcv_continue_pause_kill
--
-- DP09 is six fit tests scored 0 to 3 (maximum 18), taken three times
-- (baseline, mid point, close) -> gtcv_readiness_scores, one row per
-- (client, fit test, checkpoint).
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * RLS reuses the established helpers: can_view_client(text) for read
--     and can_manage_client_access(text) for write, exactly as in
--     2026_08_08_gtcv_engagement_commercial_layer.sql.
--   * Method rules that must hold in the database (score ranges, the three
--     checkpoints, the three decisions) are CHECK constraints. Rules that
--     are guidance rather than law (name a budget holder, only the top 3 to
--     5 hypotheses advance, evidence required above a score of 1) are
--     enforced in the UI so the coach can see the warning and act, rather
--     than being blocked by a database error.
--
-- SAFE TO APPLY: additive only (create ... if not exists). Nothing existing
-- is dropped or altered. Apply to STAGING first, verify, then production.
--
-- Depends on: engagement_clients, can_view_client(text) and
-- can_manage_client_access(text).
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_assumptions -- Tool 1, the Assumption Dump Canvas.
--    Every activity the organisation runs, what it delivers, who pays for
--    it, the assumption sitting underneath it, and what would prove that
--    assumption wrong.
-- ------------------------------------------------------------
create table if not exists gtcv_assumptions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  activity text,                 -- the activity as the organisation names it
  delivers text,                 -- what it actually delivers
  who_pays text,                 -- who pays for it today
  assumption text,               -- the assumption underneath it
  disproof text,                 -- what would prove the assumption wrong
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_assumptions_client on gtcv_assumptions(client_id);

-- ------------------------------------------------------------
-- 2) gtcv_problem_owner_budget -- Tool 2, the Problem Owner Budget Matrix.
--    Rule: if you cannot name a budget holder, pause the problem. The rule
--    is surfaced in the UI as an inline warning on the row, so the gap is
--    visible rather than silently rejected.
-- ------------------------------------------------------------
create table if not exists gtcv_problem_owner_budget (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  problem text,                  -- the problem implied by the activity
  experienced_by text,           -- who experiences it
  accountable text,              -- who is accountable for solving it
  budget_holder text,            -- who controls the budget (blank => pause)
  cost_of_not_solving text,      -- what it costs them not to solve it
  budget_mechanism text,         -- how money would actually be released
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_problem_owner_budget_client on gtcv_problem_owner_budget(client_id);

-- ------------------------------------------------------------
-- 3) gtcv_hypotheses_shortlist -- Tool 3, the Hypothesis Shortlist Board.
--    Each emerging hypothesis is scored 1 to 5 on Urgency, Ownership
--    clarity, Willingness to pay and Access. The total is computed, and
--    only the top 3 to 5 advance. Scores allow 0 to mean "not yet scored".
-- ------------------------------------------------------------
create table if not exists gtcv_hypotheses_shortlist (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  hypothesis text,
  urgency int not null default 0 check (urgency between 0 and 5),
  ownership_clarity int not null default 0 check (ownership_clarity between 0 and 5),
  willingness_to_pay int not null default 0 check (willingness_to_pay between 0 and 5),
  access int not null default 0 check (access between 0 and 5),
  -- Set when the coach confirms this hypothesis advances out of Phase 0.
  advances boolean not null default false,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_hypotheses_shortlist_client on gtcv_hypotheses_shortlist(client_id);

-- ------------------------------------------------------------
-- 4) gtcv_signal_story -- Tool 4, the Signal vs Story Board. What was
--    actually observed, versus what is believed but not observed, with
--    each item classified.
-- ------------------------------------------------------------
create table if not exists gtcv_signal_story (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  item text,                     -- the claim, statement or observation
  observed text,                 -- what was actually observed
  believed text,                 -- what is believed but not observed
  classification text not null default 'unclassified'
    check (classification in ('signal','story','unclassified')),
  source text,                   -- where it came from
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_signal_story_client on gtcv_signal_story(client_id);

-- ------------------------------------------------------------
-- 5) gtcv_continue_pause_kill -- Tool 5, the Continue / Pause / Kill
--    Table. Every activity must land somewhere, with a one sentence
--    rationale and the decision point it travels to next.
-- ------------------------------------------------------------
create table if not exists gtcv_continue_pause_kill (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  activity text,
  decision text not null default 'undecided'
    check (decision in ('continue','pause','kill','undecided')),
  rationale text,                -- one sentence, why it lands there
  destination_dp text,           -- 'dp01'..'dp09', the gate it travels to
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_continue_pause_kill_client on gtcv_continue_pause_kill(client_id);

-- ------------------------------------------------------------
-- 6) gtcv_readiness_scores -- DP09, the Commercial Readiness Diagnostic.
--    Six fit tests by three checkpoints, each scored 0 to 3, maximum 18
--    per checkpoint. Evidence is required for any score above 1 (enforced
--    in the UI with a visible message, so the coach is told why a score
--    will not take). One row per client, fit test and checkpoint.
--
--    fit_test values: 'problem_provider','problem_solution',
--    'solution_customer','solution_pilot','solution_market',
--    'solution_scale'.
--
--    Bands on the checkpoint total: under 12 not ready, 12 to 15 ready to
--    scale, 15 to 18 comprehensively validated. Pilot entry gate: at mid
--    point, problem_solution and solution_customer must both be at least 2.
-- ------------------------------------------------------------
create table if not exists gtcv_readiness_scores (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  fit_test text not null check (fit_test in (
    'problem_provider','problem_solution','solution_customer',
    'solution_pilot','solution_market','solution_scale'
  )),
  checkpoint text not null check (checkpoint in ('baseline','midpoint','close')),
  score int not null default 0 check (score between 0 and 3),
  evidence text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, fit_test, checkpoint)
);
create index if not exists idx_gtcv_readiness_scores_client on gtcv_readiness_scores(client_id);

-- ------------------------------------------------------------
-- RLS: read for anyone who can view the client, write for whoever manages
-- the client. Both helpers already encapsulate the super_coach exception,
-- so the policies below are identical across the six tables.
--
-- policy coach_funder_read on gtcv_assumptions: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_problem_owner_budget: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_hypotheses_shortlist: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_signal_story: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_continue_pause_kill: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_readiness_scores: super_coach, assigned co-implementer, the client's own users and the funder.
-- ------------------------------------------------------------
alter table gtcv_assumptions enable row level security;
alter table gtcv_problem_owner_budget enable row level security;
alter table gtcv_hypotheses_shortlist enable row level security;
alter table gtcv_signal_story enable row level security;
alter table gtcv_continue_pause_kill enable row level security;
alter table gtcv_readiness_scores enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'gtcv_assumptions','gtcv_problem_owner_budget','gtcv_hypotheses_shortlist',
    'gtcv_signal_story','gtcv_continue_pause_kill','gtcv_readiness_scores'
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
grant select, insert, update, delete on public.gtcv_assumptions to authenticated;
grant select, insert, update, delete on public.gtcv_problem_owner_budget to authenticated;
grant select, insert, update, delete on public.gtcv_hypotheses_shortlist to authenticated;
grant select, insert, update, delete on public.gtcv_signal_story to authenticated;
grant select, insert, update, delete on public.gtcv_continue_pause_kill to authenticated;
grant select, insert, update, delete on public.gtcv_readiness_scores to authenticated;
