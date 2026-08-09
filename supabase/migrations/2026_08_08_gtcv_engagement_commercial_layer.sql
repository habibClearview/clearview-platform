-- ============================================================
-- GtCV: the engagement commercial layer (deliverables, gate mapping,
-- payment milestones, the Engagement Charter, and config-driven parties).
--
-- WHY: the canvas layer already exists in the database (evidence_library,
-- handover_record, canvas_decision_points, canvas_components, hypotheses,
-- interviews, pilot_observations, engagement_diagnostic, canvas_dp_status
-- -- see RLS in 2026_07_13_funder_coimplementer_access.sql and the loaders
-- in src/components/coach/CoachDashboard.tsx). What does NOT exist yet is
-- the *commercial* wrapper around a canvas engagement: the client's
-- contractual deliverables, the mapping of each deliverable onto the
-- decision gates that evidence it, the payment milestone each deliverable
-- triggers, the tri-party Engagement Charter and its e-signatures, and the
-- parties (some of whom -- e.g. a funder representative -- have no login).
--
-- This is the foundation the online journey map, the Engagement Charter,
-- the two-stage email flow, and (Phase 2) the ToR->gate auto-mapping and
-- auto-invoice loop all sit on. It is CLIENT-AGNOSTIC: every party name,
-- currency, deliverable, and mapping is data. Tanager/Ikore is the first
-- record, never hardcoded.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * dp_id is TEXT using the app's runtime values:
--       'setup' | 'phase_0' | 'dp01'..'dp09' | 'handover'.
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users, and
--     the programme funder) and can_manage_client_access(text) for write
--     (super_coach or the assigned co-implementer only -- never a funder,
--     never the client, matching client_access_grants).
--   * Charter signing is the one exception: an authenticated signer (the
--     client ED, the funder rep with a login, the coach) may insert THEIR
--     OWN signature; non-login signers sign through a service-role API
--     route (like app/api/access-grant/[token]/route.ts), which bypasses
--     RLS by design.
--
-- SAFE TO APPLY: additive only (CREATE ... IF NOT EXISTS; new policies
-- alongside existing ones). Nothing existing is dropped or altered. Apply
-- to the STAGING Supabase project first (see docs/STAGING_AND_ROLLBACK.md),
-- verify, then production. Paste into the Supabase SQL editor and Run.
--
-- Depends on: can_view_client(text) and can_manage_client_access(text)
-- (2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql) -- run those first if not applied.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) engagement_config -- 1:1 per-engagement configuration that does not
--    belong on the core engagement_clients row. Kept as a companion table
--    so the live engagement_clients table is never altered by this feature.
-- ────────────────────────────────────────────────────────────
create table if not exists engagement_config (
  client_id text primary key references engagement_clients(id) on delete cascade,
  -- The client's Terms of Reference (a link/id to the source doc). The
  -- Phase-2 ToR->gate auto-mapping reads from here.
  tor_reference text,
  tor_uploaded boolean not null default false,
  -- Label preference: the method calls a gate a "Zone" or a "Decision
  -- Point" interchangeably; let each engagement choose.
  terminology text not null default 'zone' check (terminology in ('zone','dp')),
  -- Live momentum flag (the GREEN/AMBER/RED protocol).
  momentum_status text not null default 'green' check (momentum_status in ('green','amber','red')),
  -- Configurable method thresholds where the source workbooks disagree
  -- (see docs/gtcv/gtcv-method-reference.md §F). NULL = use the app default.
  -- DP02 minimum validation conversations per segment. The Handbook is
  -- canonical: minimum 5 (with >=3 converging as the real pass condition).
  -- NULL => use the app default (5).
  validation_min_per_segment int,
  -- Which five handover independence tests to use. The Handbook (Ch.17) is
  -- canonical and matches the Tools Workbook set, so 'tools' is the default.
  independence_test_set text default 'tools'
    check (independence_test_set in ('engagement','tools')),
  -- Per-engagement brand overrides (falls back to the app --cv-* tokens).
  brand_overrides jsonb,
  -- Whether the no-login journey-map showcase link is enabled for this
  -- engagement (the actual token lives in client_access_grants).
  showcase_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 2) engagement_parties -- the people in the engagement and their role.
--    Includes parties WITHOUT a login (e.g. a funder representative who
--    only receives reports and signs), so this is config, not auth.
-- ────────────────────────────────────────────────────────────
create table if not exists engagement_parties (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- Canonical roles drawn from the method (see method-reference §A). Free
  -- text with a check so new roles are a one-line change, not a schema one.
  party_role text not null check (party_role in (
    'client_funder','funder_rep','lsp_ed','lsp_leadership','lsp_finance',
    'lsp_field','lsp_board','lead_consultant','co_implementer','licensed_advisor','other'
  )),
  name text not null,
  email text,
  organisation text,
  title text,
  -- Whether this party signs the Engagement Charter.
  is_signatory boolean not null default false,
  -- Link to a real login if they have one (nullable -- many won't).
  user_id uuid references auth.users(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_engagement_parties_client on engagement_parties(client_id);

-- ────────────────────────────────────────────────────────────
-- 3) engagement_deliverables -- the contractual deliverables schedule and
--    the payment milestone each one triggers on acceptance.
-- ────────────────────────────────────────────────────────────
create table if not exists engagement_deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  code text,                       -- e.g. 'Inception','D1','D2'
  title text not null,
  description text,
  milestone_no int,                -- payment milestone grouping (1..n)
  milestone_label text,            -- e.g. 'Service Bundle Refinement'
  payment_amount numeric,
  payment_currency text not null default 'USD',
  due_window text,                 -- free text, e.g. 'Aug 2026'
  sort_order int not null default 0,
  -- Deliverable lifecycle. 'accepted' is set when its mapped gate(s) reach
  -- coach_authorised; 'invoiced'/'paid' drive the Phase-2 auto-invoice loop.
  status text not null default 'pending'
    check (status in ('pending','in_progress','accepted','invoiced','paid')),
  accepted_at timestamptz,
  invoiced_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_engagement_deliverables_client on engagement_deliverables(client_id);

-- ────────────────────────────────────────────────────────────
-- 4) deliverable_gate_map -- the mapping of a deliverable onto the decision
--    gate(s) that evidence it, plus the means-of-verification each gate
--    needs. The coach confirms each row (approved=true) -- in Phase 2 the
--    rows may be AI-proposed (source='ai_proposed') and then approved.
-- ────────────────────────────────────────────────────────────
create table if not exists deliverable_gate_map (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  deliverable_id uuid not null references engagement_deliverables(id) on delete cascade,
  dp_id text not null,             -- 'setup'|'phase_0'|'dp01'..'dp09'|'handover'
  required_evidence text,          -- means of verification for this gate
  -- Coach confirmation of the mapping line (confirm/edit/reject/approve).
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  -- Provenance: hand-mapped, or proposed by the Phase-2 ToR engine.
  source text not null default 'manual' check (source in ('manual','ai_proposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, dp_id)
);
create index if not exists idx_deliverable_gate_map_client on deliverable_gate_map(client_id);
create index if not exists idx_deliverable_gate_map_deliverable on deliverable_gate_map(deliverable_id);

-- ────────────────────────────────────────────────────────────
-- 5) engagement_charters -- the tri-party Engagement Charter. Content is a
--    structured snapshot (commercial terms + responsibilities + governance)
--    so a signed charter is immutable even if the config later changes.
-- ────────────────────────────────────────────────────────────
create table if not exists engagement_charters (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  version int not null default 1,
  title text,
  content jsonb,                   -- rendered Charter structure at issue time
  status text not null default 'draft'
    check (status in ('draft','issued','signed','superseded')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, version)
);
create index if not exists idx_engagement_charters_client on engagement_charters(client_id);

-- ────────────────────────────────────────────────────────────
-- 6) charter_signatures -- the e-signatures on a charter version.
-- ────────────────────────────────────────────────────────────
create table if not exists charter_signatures (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references engagement_charters(id) on delete cascade,
  client_id text not null references engagement_clients(id) on delete cascade,
  party_id uuid references engagement_parties(id) on delete set null,
  signer_role text not null,
  signer_name text not null,
  signer_email text,
  signer_user_id uuid references auth.users(id) on delete set null,
  signature_method text not null default 'click' check (signature_method in ('click','typed')),
  typed_name text,                 -- when signature_method='typed'
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_charter_signatures_charter on charter_signatures(charter_id);
create index if not exists idx_charter_signatures_client on charter_signatures(client_id);

-- ────────────────────────────────────────────────────────────
-- RLS -- read for anyone who can view the client (super_coach, assigned
-- co-implementer, the client's own users, the programme funder -- all via
-- can_view_client); write for whoever MANAGES the client (super_coach or
-- the assigned co-implementer, via can_manage_client_access). Both helpers
-- encapsulate the super_coach exception. Mirrors client_access_grants +
-- funder_coimplementer_access exactly.
--
-- RLS is enabled explicitly per table (below); the policies are then
-- applied in one loop to keep them identical across the five tables.
-- ────────────────────────────────────────────────────────────
alter table engagement_config enable row level security;        -- super_coach via can_view_client/can_manage_client_access
alter table engagement_parties enable row level security;       -- super_coach via can_view_client/can_manage_client_access
alter table engagement_deliverables enable row level security;  -- super_coach via can_view_client/can_manage_client_access
alter table deliverable_gate_map enable row level security;     -- super_coach via can_view_client/can_manage_client_access
alter table engagement_charters enable row level security;      -- super_coach via can_view_client/can_manage_client_access

do $$
declare t text;
begin
  foreach t in array array[
    'engagement_config','engagement_parties','engagement_deliverables',
    'deliverable_gate_map','engagement_charters'
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

-- charter_signatures: read for anyone who can view the client; managers may
-- do anything; and additionally, an AUTHENTICATED signer may insert THEIR
-- OWN signature on a charter for a client they can view (so the client's
-- Executive Director / a funder rep with a login can sign without being a
-- manager). Non-login signers sign via a service-role API route.
alter table charter_signatures enable row level security;

drop policy if exists coach_funder_read on charter_signatures;
create policy coach_funder_read on charter_signatures for select
  using (can_view_client(client_id));

drop policy if exists coach_manage on charter_signatures;
create policy coach_manage on charter_signatures for all
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

drop policy if exists signer_self_insert on charter_signatures;
create policy signer_self_insert on charter_signatures for insert
  with check (can_view_client(client_id) and signer_user_id = auth.uid());
