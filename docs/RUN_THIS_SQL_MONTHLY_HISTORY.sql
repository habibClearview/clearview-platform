-- ============================================================
-- RUN THIS ONCE, IN THE SUPABASE SQL EDITOR.
--
-- It creates the place where the monthly readings are kept. Nothing reads it
-- yet and nothing on any screen changes. Until it exists the monthly job has
-- nowhere to write, so this is the one step that has to happen first.
--
-- Safe to run twice. Every statement checks first.
-- ============================================================

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  ref_code text not null,
  snapshot_month date not null,
  taken_at timestamptz not null default now(),
  engagement_mode text not null default 'financial',
  sector text,
  country text,
  programme_id text,
  currency text,
  consent_to_be_named boolean not null default false,
  ir_score numeric,
  ir_tier text,
  readiness_stage text,
  confidence_score numeric,
  confidence_badges text[],
  annual_revenue numeric,
  declared_revenue numeric,
  verified_revenue numeric,
  unattributed_revenue numeric,
  fac_amount numeric,
  fac_band text,
  revenue_growth_pct numeric,
  cost_ratio_pct numeric,
  gross_margin_pct numeric,
  ebitda_margin_pct numeric,
  net_margin_pct numeric,
  rule_of_40 numeric,
  dscr_min numeric,
  burn_multiple numeric,
  roi_pct numeric,
  decision_points_signed int,
  decision_points_total int,
  readiness_checkpoints_taken int,
  detail jsonb,
  skipped_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_portfolio_snapshots_client_month
  on portfolio_snapshots (client_id, snapshot_month);
create index if not exists idx_portfolio_snapshots_month
  on portfolio_snapshots (snapshot_month);
create index if not exists idx_portfolio_snapshots_grouping
  on portfolio_snapshots (snapshot_month, sector, country, programme_id);
create index if not exists idx_portfolio_snapshots_ref
  on portfolio_snapshots (ref_code, snapshot_month);

alter table portfolio_snapshots enable row level security;
drop policy if exists portfolio_snapshots_read on portfolio_snapshots;
create policy portfolio_snapshots_read on portfolio_snapshots for select using (my_role() = 'super_coach');

-- Check it worked. This should come back with no rows and no error.
select count(*) as readings_so_far from portfolio_snapshots;
