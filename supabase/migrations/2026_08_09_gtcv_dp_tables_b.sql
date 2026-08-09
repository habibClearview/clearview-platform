-- ============================================================
-- GtCV working surfaces, set B: the DP02 customer profile and adoption
-- test, the DP02 problem prioritisation scoring grid, and the DP03
-- proposition builder with its test log.
--
-- WHY: the commercial wrapper (deliverables, gate map, charter) landed in
-- 2026_08_08_gtcv_engagement_commercial_layer.sql. What is still missing is
-- the place a coach and an organisation actually DO the DP02 and DP03 work
-- online, instead of in a spreadsheet tab. These four tables hold that work.
--
-- METHOD RULES ENCODED HERE (from the GtCV handbook):
--   * Three-Stage Adoption Test: a customer must be Willing, then Able,
--     then Prioritised, in that order. Prioritised is the real commercial
--     signal. The first stage that is not a clear yes is where the segment
--     is stuck, and the stages after it do not count.
--   * DP02 gate: a minimum of 5 validation conversations per segment, with
--     at least 3 of them converging on the same problem, the same budget
--     and the same willingness to pay. Both numbers are recorded per
--     segment so the gate can be read off the row.
--   * DP03: a value proposition has four parts, Capability, Problem,
--     Outcome and Reason to choose. Differentiation is one of exactly
--     three types, Capability, Context or Access.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * RLS reuses the established helpers: can_view_client(text) for read
--     and can_manage_client_access(text) for write. Both encapsulate the
--     super_coach exception.
--   * Every new table gets explicit RLS, both policies, and table grants
--     to the authenticated role.
--
-- CLIENT AGNOSTIC: every segment, problem, score and proposition is data.
-- No organisation is named in this schema.
--
-- SAFE TO APPLY: additive only (create ... if not exists). Nothing existing
-- is dropped or altered. Apply to STAGING first, verify, then production.
--
-- Depends on: engagement_clients, can_view_client(text) and
-- can_manage_client_access(text) (see 2026_07_13_client_access_grants.sql
-- and 2026_07_13_funder_coimplementer_access.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_customer_segments -- one row per candidate customer segment:
--    who they are, the problem in their own words, who actually holds the
--    budget, how urgent it is, the Three-Stage Adoption Test answers, and
--    the validation conversation counts the DP02 gate is read from.
-- ------------------------------------------------------------
create table if not exists gtcv_customer_segments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- The segment as the organisation names it, e.g. 'District agriculture offices'.
  segment_name text not null default '',
  -- The problem quoted the way the customer says it, not the way the
  -- organisation describes it. Verbatim is the point.
  problem_in_their_words text,
  -- The named person who can release money, and the role they hold. A
  -- segment with no named budget holder cannot pass DP02.
  budget_holder_name text,
  budget_holder_role text,
  -- How urgent the problem is for them, 1 (can wait) to 5 (acting now).
  problem_urgency int check (problem_urgency between 1 and 5),
  -- Three-Stage Adoption Test, in order. Willing (they want it solved),
  -- Able (they can buy: budget, authority, procurement route), then
  -- Prioritised (it beats the other calls on the same money this period).
  -- Prioritised is the real commercial signal; the other two are necessary
  -- but not sufficient. 'unsure' is a legitimate answer and is treated as
  -- not yet passed.
  willing text not null default 'unsure' check (willing in ('yes','no','unsure')),
  able text not null default 'unsure' check (able in ('yes','no','unsure')),
  prioritised text not null default 'unsure' check (prioritised in ('yes','no','unsure')),
  -- DP02 gate counts. Minimum 5 conversations logged per segment, of which
  -- at least 3 must converge on the same problem, budget and willingness
  -- to pay. Stored, not inferred, so the gate strip is auditable.
  conversations_logged int not null default 0 check (conversations_logged >= 0),
  converging_count int not null default 0 check (converging_count >= 0),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_customer_segments_client on gtcv_customer_segments(client_id);

-- ------------------------------------------------------------
-- 2) gtcv_problem_scores -- the DP02 problem prioritisation grid. Each
--    candidate problem is scored 1 to 5 on four dimensions. The total is
--    the sum; the top three by total are the ones that advance to DP03.
--    The total is deliberately NOT stored: it is the sum of the four
--    scores and is recomputed on read, so it can never drift.
-- ------------------------------------------------------------
create table if not exists gtcv_problem_scores (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- Optional link to the segment that reported this problem. Nullable so a
  -- problem can be scored before its segment row exists.
  segment_id uuid references gtcv_customer_segments(id) on delete set null,
  problem_statement text not null default '',
  -- Who feels it, free text when no segment row is linked.
  segment_label text,
  -- Urgency: how hard the problem is pressing on them right now.
  urgency_score int check (urgency_score between 1 and 5),
  -- Ownership clarity: how clearly one named person owns the problem.
  ownership_clarity_score int check (ownership_clarity_score between 1 and 5),
  -- Willingness to pay: evidence they would pay to have it solved.
  willingness_to_pay_score int check (willingness_to_pay_score between 1 and 5),
  -- Access: how reachable the budget holder actually is.
  access_score int check (access_score between 1 and 5),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_problem_scores_client on gtcv_problem_scores(client_id);
create index if not exists idx_gtcv_problem_scores_segment on gtcv_problem_scores(segment_id);

-- ------------------------------------------------------------
-- 3) gtcv_propositions -- the DP03 proposition builder, one per priority
--    segment. The four parts are held separately so the proposition can be
--    assembled, and the assembled paragraph is stored too because the
--    organisation edits the wording after the parts are agreed.
-- ------------------------------------------------------------
create table if not exists gtcv_propositions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  segment_id uuid references gtcv_customer_segments(id) on delete set null,
  -- Free-text label used when no segment row is linked.
  segment_label text,
  -- The four parts of a GtCV value proposition.
  capability text,          -- what we can do
  problem text,             -- the problem it removes, in their words
  outcome text,             -- what changes for them, stated as a result
  reason_to_choose text,    -- why us rather than the alternative
  -- Differentiation is one of exactly three types in the method.
  differentiation_type text check (differentiation_type in ('capability','context','access')),
  differentiation_statement text,
  -- The proof that makes the claim believable, e.g. a named reference.
  credibility_signal text,
  -- The assembled paragraph. Composed from the four parts, then edited.
  -- assembled_is_custom flags that a human has edited it, so the app stops
  -- overwriting it when the parts change.
  assembled_statement text,
  assembled_is_custom boolean not null default false,
  -- How many times this proposition has been revised after a test. The
  -- method expects the revision to get shorter and more specific.
  revision_count int not null default 0 check (revision_count >= 0),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_propositions_client on gtcv_propositions(client_id);
create index if not exists idx_gtcv_propositions_segment on gtcv_propositions(segment_id);

-- ------------------------------------------------------------
-- 4) gtcv_proposition_tests -- the DP03 test log. A proposition is not
--    finished when it reads well, it is finished when a real customer has
--    reacted to it and something changed as a result.
-- ------------------------------------------------------------
create table if not exists gtcv_proposition_tests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  proposition_id uuid not null references gtcv_propositions(id) on delete cascade,
  -- Who it was tested with: person and organisation, plus their role.
  tested_with text,
  tested_with_role text,
  tested_on date,
  -- What they actually said or did when they heard it.
  reaction text,
  -- What changed in the proposition because of that reaction. An empty
  -- value here is the signal that the test taught nothing.
  what_changed text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_proposition_tests_client on gtcv_proposition_tests(client_id);
create index if not exists idx_gtcv_proposition_tests_proposition on gtcv_proposition_tests(proposition_id);

-- ------------------------------------------------------------
-- RLS. Read for anyone who can view the client (super_coach, assigned
-- co-implementer, the client's own users, the programme funder), write for
-- whoever manages the client (super_coach or the assigned co-implementer).
-- Policies are written out per table rather than looped, so each table's
-- access rule is readable on its own.
-- ------------------------------------------------------------
alter table gtcv_customer_segments enable row level security;
alter table gtcv_problem_scores enable row level security;
alter table gtcv_propositions enable row level security;
alter table gtcv_proposition_tests enable row level security;

-- Read policy on gtcv_customer_segments: can_view_client, which includes super_coach.
drop policy if exists coach_funder_read on gtcv_customer_segments;
create policy coach_funder_read on gtcv_customer_segments for select
  using (can_view_client(client_id));
-- Write policy on gtcv_customer_segments: can_manage_client_access, super_coach or assigned co-implementer only.
drop policy if exists coach_manage on gtcv_customer_segments;
create policy coach_manage on gtcv_customer_segments for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- Read policy on gtcv_problem_scores: can_view_client, which includes super_coach.
drop policy if exists coach_funder_read on gtcv_problem_scores;
create policy coach_funder_read on gtcv_problem_scores for select
  using (can_view_client(client_id));
-- Write policy on gtcv_problem_scores: can_manage_client_access, super_coach or assigned co-implementer only.
drop policy if exists coach_manage on gtcv_problem_scores;
create policy coach_manage on gtcv_problem_scores for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- Read policy on gtcv_propositions: can_view_client, which includes super_coach.
drop policy if exists coach_funder_read on gtcv_propositions;
create policy coach_funder_read on gtcv_propositions for select
  using (can_view_client(client_id));
-- Write policy on gtcv_propositions: can_manage_client_access, super_coach or assigned co-implementer only.
drop policy if exists coach_manage on gtcv_propositions;
create policy coach_manage on gtcv_propositions for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- Read policy on gtcv_proposition_tests: can_view_client, which includes super_coach.
drop policy if exists coach_funder_read on gtcv_proposition_tests;
create policy coach_funder_read on gtcv_proposition_tests for select
  using (can_view_client(client_id));
-- Write policy on gtcv_proposition_tests: can_manage_client_access, super_coach or assigned co-implementer only.
drop policy if exists coach_manage on gtcv_proposition_tests;
create policy coach_manage on gtcv_proposition_tests for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- ------------------------------------------------------------
-- Grants. RLS decides which rows; the grant decides whether the role may
-- reach the table at all. Both are required.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.gtcv_customer_segments to authenticated;
grant select, insert, update, delete on public.gtcv_problem_scores to authenticated;
grant select, insert, update, delete on public.gtcv_propositions to authenticated;
grant select, insert, update, delete on public.gtcv_proposition_tests to authenticated;
