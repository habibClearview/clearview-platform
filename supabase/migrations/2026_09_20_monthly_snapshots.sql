-- ============================================================
-- THE MONTHLY PHOTOGRAPH
--
-- Every figure the platform produces is today's figure. Open the portfolio
-- view and it works everything out afresh; close it and nothing is kept. So
-- the platform can say where an organisation stands and not whether it is
-- moving, which is the only question a benchmark, a lender or a programme
-- designer actually asks.
--
-- The coaching side already keeps three points in time, at kick-off, mid-point
-- and close (gtcv_readiness_scores). The financial side keeps nothing. This is
-- that memory: one row per engagement per month, written once and never
-- changed afterwards.
--
-- It collects nothing new from anybody. Every value in it is already worked
-- out today and thrown away.
--
-- THE THREE DECISIONS THIS TABLE ENCODES, taken 20 September 2026.
--
--   No name is stored, ever. Not the organisation's name and not a person's.
--   A photograph carries the engagement's id and a stable reference code, and
--   a name is only ever resolved by looking at the live engagement record. So
--   "remove the name from every photograph, past ones included" is not a job
--   somebody has to run and could forget: there is nothing there to remove.
--
--   A photograph outlives the engagement. client_id deliberately carries NO
--   foreign key, so deleting an engagement cannot take its history with it.
--   The reference code is derived from the id and stays stable, so one
--   organisation can still be followed through time after its live record is
--   gone, without anybody being able to work backwards to who it was.
--
--   They are kept indefinitely. One row per engagement per month is a few
--   hundred rows a year. The longer the record runs the more it is worth.
--
-- WHY THE FIGURES ARE BOTH SPREAD OUT AND KEPT WHOLE. The columns are the
-- things that get filtered, grouped and averaged, so they are real columns
-- with real types. The whole reading is kept beside them as well, because a
-- measure nobody thought of in 2026 can still be worked out in 2028 from a
-- photograph that kept everything, and cannot be from one that kept a summary.
-- ============================================================

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),

  -- The engagement this reading is of. No foreign key on purpose: see above.
  client_id text not null,
  -- Stable, derived from the id, and the only handle once the engagement is
  -- gone. Matches anonymizedRefCode() in src/lib/portfolio-intelligence.ts.
  ref_code text not null,

  -- The month this is a reading of, always the first day of that month, so
  -- one engagement can have exactly one reading per month.
  snapshot_month date not null,
  -- When it was actually taken, which is not the same thing.
  taken_at timestamptz not null default now(),

  -- Which kind of engagement this was at the time: 'financial' or 'canvas'.
  engagement_mode text not null default 'financial',

  -- ── What it is, for grouping. Never a name. ──────────────
  sector text,
  country text,
  programme_id text,
  currency text,
  consent_to_be_named boolean not null default false,

  -- ── Where it stood. Null where it does not apply. ────────
  ir_score numeric,
  ir_tier text,
  readiness_stage text,
  confidence_score numeric,
  confidence_badges text[],

  -- Money that moved, and how much of it a second record agreed with.
  annual_revenue numeric,
  declared_revenue numeric,
  verified_revenue numeric,

  -- Fund absorption capacity, in the currency above.
  fac_amount numeric,
  fac_band text,

  -- ── How it performed. Ratios, so they compare across currencies. ──
  revenue_growth_pct numeric,
  cost_ratio_pct numeric,
  gross_margin_pct numeric,
  ebitda_margin_pct numeric,
  net_margin_pct numeric,
  rule_of_40 numeric,
  dscr_min numeric,
  burn_multiple numeric,
  roi_pct numeric,

  -- ── The coaching side, for engagements that have one. ────
  decision_points_signed int,
  decision_points_total int,
  readiness_checkpoints_taken int,

  -- The whole reading, so a measure nobody has thought of yet is still
  -- answerable from this row later.
  detail jsonb,

  -- When a reading could not be taken, this says so rather than the month
  -- being silently absent. A gap and a failure are different facts.
  skipped_reason text,

  created_at timestamptz not null default now()
);

-- One reading per engagement per month. Running the job twice replaces rather
-- than duplicating, which is what makes it safe to run every day.
create unique index if not exists uq_portfolio_snapshots_client_month
  on portfolio_snapshots (client_id, snapshot_month);

create index if not exists idx_portfolio_snapshots_month
  on portfolio_snapshots (snapshot_month);
create index if not exists idx_portfolio_snapshots_grouping
  on portfolio_snapshots (snapshot_month, sector, country, programme_id);
create index if not exists idx_portfolio_snapshots_ref
  on portfolio_snapshots (ref_code, snapshot_month);

-- ── Who may read it ─────────────────────────────────────────
-- Written only by the scheduled job, which uses the service key and so is not
-- subject to these policies at all. Read by the lead consultant only: this is
-- a whole-platform view across every engagement, which is nobody else's to
-- see. Anything that should reach a funder or a subscriber goes through a
-- route that anonymises and aggregates first, never through this table.
alter table portfolio_snapshots enable row level security;

drop policy if exists portfolio_snapshots_read on portfolio_snapshots;
create policy portfolio_snapshots_read on portfolio_snapshots for select using (my_role() = 'super_coach');

comment on table portfolio_snapshots is
  'One reading per engagement per month, written once and never changed. Holds no name.';
comment on column portfolio_snapshots.client_id is
  'Deliberately carries no foreign key, so history outlives the engagement.';
comment on column portfolio_snapshots.ref_code is
  'Stable anonymous handle, the only way to follow one organisation once its live record is gone.';
comment on column portfolio_snapshots.detail is
  'The whole reading, so a measure nobody has thought of yet is still answerable later.';
