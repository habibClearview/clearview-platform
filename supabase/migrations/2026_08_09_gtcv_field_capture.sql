-- ============================================================
-- GtCV field capture: the Interview Capture form, and the columns the
-- Evidence Library needs to become a real audit trail.
--
-- WHY: the workbook's field capture section is where the raw evidence of an
-- engagement is produced. Two things were missing from the platform:
--
--   1. Interview Capture. The method scores six dimensions of every customer
--      validation conversation, each one with the verbatim words first and
--      the interpretation second, then a post interview summary. The rule is
--      that the form is completed within 30 minutes of the conversation,
--      before memory degrades. Until now that form lived in a spreadsheet
--      tab duplicated per field team member, so nobody could see the whole
--      set of conversations at once.
--
--   2. Evidence Library columns. The table already exists and is already
--      loaded by src/components/coach/CoachDashboard.tsx. What it did not
--      carry was the decision point it belongs to, the reliability rating,
--      the lifecycle status, and the path of an uploaded file. Those four
--      columns are added here with add column if not exists. Nothing
--      existing is dropped, renamed or retyped.
--
-- The six dimensions are the method's, in the method's order:
--   Role and Accountability, Problem Reality, Consequence Severity,
--   Current Attempts, Budget and Authority, Willingness to Pay.
-- Each one carries a score of 1 to 5, the verbatim evidence, and the
-- interpretation. Verbatim first. No polishing.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id) on delete
--     cascade, exactly like engagement_parties and gtcv_service_inventory.
--   * dp_id is TEXT using the app's runtime values:
--       'setup' | 'phase_0' | 'dp01'..'dp09' | 'handover'.
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users and the
--     programme funder) and can_manage_client_access(text) for write
--     (super_coach or the assigned co-implementer only).
--   * The new table gets an explicit grant to authenticated; RLS then
--     decides which rows that role actually sees.
--   * Scores allow NULL and the select columns allow NULL, so a half filled
--     capture saves while the write up is still in progress.
--
-- CLIENT AGNOSTIC: no client, organisation, interviewee or segment is named
-- here. Every value is data entered per engagement.
--
-- SAFE TO APPLY: additive only (create table if not exists, add column if
-- not exists, policies dropped and recreated by name). Apply to the STAGING
-- Supabase project first (see docs/STAGING_AND_ROLLBACK.md), verify, then
-- production. Paste into the Supabase SQL editor and Run.
--
-- Depends on: engagement_clients, the existing evidence_library table, and
-- can_view_client(text) / can_manage_client_access(text) from
-- 2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql. Run those first if not applied.
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_interview_captures (Interview Capture, field capture section)
--    One row per customer validation conversation.
-- ------------------------------------------------------------
create table if not exists gtcv_interview_captures (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,

  -- Interview details. Who ran it, who was in the room, and when.
  interviewer_name text,
  interviewee_name text,
  interviewee_role text,
  organisation text,
  segment text,
  interview_date date,
  -- When the conversation happened. The 30 minute write up discipline is
  -- measured from this timestamp, so the surface can show the time elapsed
  -- while the capture is still a draft.
  captured_at timestamptz,

  -- Dimension 1: Role and Accountability.
  -- Who owns this problem, and who is accountable for solving it.
  role_accountability_score int check (role_accountability_score is null or role_accountability_score between 1 and 5),
  role_accountability_verbatim text,
  role_accountability_interpretation text,

  -- Dimension 2: Problem Reality.
  -- Is this a real, recurring problem or a one off irritation.
  problem_reality_score int check (problem_reality_score is null or problem_reality_score between 1 and 5),
  problem_reality_verbatim text,
  problem_reality_interpretation text,

  -- Dimension 3: Consequence Severity.
  -- What it costs them when the problem is not solved.
  consequence_severity_score int check (consequence_severity_score is null or consequence_severity_score between 1 and 5),
  consequence_severity_verbatim text,
  consequence_severity_interpretation text,

  -- Dimension 4: Current Attempts.
  -- What they have already tried, and what happened when they tried it.
  current_attempts_score int check (current_attempts_score is null or current_attempts_score between 1 and 5),
  current_attempts_verbatim text,
  current_attempts_interpretation text,

  -- Dimension 5: Budget and Authority.
  -- Whether money exists and who has to approve spending it.
  budget_authority_score int check (budget_authority_score is null or budget_authority_score between 1 and 5),
  budget_authority_verbatim text,
  budget_authority_interpretation text,

  -- Dimension 6: Willingness to Pay.
  -- What they have paid for comparable support, and what would make a
  -- solution worth the investment.
  willingness_to_pay_score int check (willingness_to_pay_score is null or willingness_to_pay_score between 1 and 5),
  willingness_to_pay_verbatim text,
  willingness_to_pay_interpretation text,

  -- Post interview summary, completed immediately after the conversation.
  most_important_verbatim text,
  strongest_purchasing_signal text,
  budget_signal_strength text check (budget_signal_strength is null or budget_signal_strength in ('strong','moderate','weak','none')),
  assumption_confirmed text,
  assumption_overturned text,
  follow_up_needed text,
  referral_obtained text,
  overall_score int check (overall_score is null or overall_score between 1 and 5),

  -- A draft is still being written up. Submitted means it has gone to the
  -- co-implementer for synthesis.
  status text check (status in ('draft','submitted')) default 'draft',
  submitted_at timestamptz,

  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_interview_captures_client on gtcv_interview_captures(client_id);

-- ------------------------------------------------------------
-- 2) evidence_library, additive columns only.
--    The table already exists and is already queried by the coach
--    dashboard (reference, date, type, description, url, uploaded_by,
--    status). These four columns complete the workbook's column set.
--    add column if not exists means re-running this is a no-op, and any
--    column already present is left exactly as it is.
-- ------------------------------------------------------------
-- The decision point this evidence came from ('phase_0', 'dp01'..'dp09').
alter table evidence_library add column if not exists dp_id text;
-- Storage object path in the 'evidence' bucket, when a file was uploaded:
-- <client_id>/<reference>-<filename>.
alter table evidence_library add column if not exists file_path text;
-- Reliability rating: firsthand, reported, or documented.
alter table evidence_library add column if not exists reliability text;
-- Lifecycle: active, archived, or superseded.
alter table evidence_library add column if not exists status text;

-- ------------------------------------------------------------
-- RLS for the new table: read for anyone who can view the client, write for
-- whoever manages it. Both helpers already encapsulate the super_coach
-- exception, so no separate super_coach policy is needed. evidence_library
-- keeps the policies it already has; nothing here touches them.
-- ------------------------------------------------------------
alter table gtcv_interview_captures enable row level security;

drop policy if exists coach_funder_read on gtcv_interview_captures;
create policy coach_funder_read on gtcv_interview_captures for select -- read: super_coach, co-implementer, client users, funder
  using (can_view_client(client_id));

drop policy if exists coach_manage on gtcv_interview_captures;
create policy coach_manage on gtcv_interview_captures for all -- write: super_coach or the assigned co-implementer only
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- ------------------------------------------------------------
-- Grants. RLS still decides the rows; without the grant the role cannot
-- reach the table at all.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.gtcv_interview_captures to authenticated;
