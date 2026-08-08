-- ============================================================
-- GtCV DP04, the Commercial Viability Model: the workbook's cost and
-- pricing surface.
--
-- WHY: DP04 is where the canvas becomes financially real. The GtCV Financial
-- Model Workbook asks four things of an engagement, and today all four live
-- in a spreadsheet that travels by email:
--
--   1. A full cost baseline in five categories, which totals to the cost
--      floor. No price may sit below that floor.
--   2. Market price references gathered from client research, so the floor
--      can be read against what the market actually pays.
--   3. Pricing tiers. Three are required (Entry, Standard, Premium) and two
--      more are optional once the first three are validated in the pilot.
--   4. Fixed costs, which drive the break even calculation.
--
-- These four tables give those four things a home, one row per line, so the
-- coach and the organisation edit the same numbers and the gate evidence is
-- queryable instead of sitting in a workbook tab.
--
-- SCOPE: this is the workbook surface only. The deeper financial engine the
-- ClearView dashboard already runs (src/lib/generic-engine.ts) is not
-- duplicated here. The DP04 surface links to it rather than rebuilding it.
--
-- WHAT IS NOT STORED, DELIBERATELY: nothing that is calculated. The cost
-- floor, the category subtotals, the overhead percentage, the per tier margin
-- and the break even are all derived from these rows by
-- src/lib/gtcv-costing.ts. Storing a derived figure is how a workbook ends up
-- with two different cost floors on two different tabs.
--
-- CURRENCY: not stored per row. Currency is set once per engagement and
-- applied everywhere, which is the workbook rule. The surface reads it from
-- the engagement configuration and passes it down.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id).
--   * RLS reuses the established helpers: can_view_client(text) for read and
--     can_manage_client_access(text) for write, exactly as in
--     2026_08_09_gtcv_dp_tables_d.sql.
--   * Method rules that are law (the five cost categories) are CHECK
--     constraints. Rules that are guidance and need a coach to see and act on
--     them (overhead at least 20 percent of direct costs, three required
--     tiers, at least three market references, never price below the floor)
--     are enforced in the UI as visible flags, not as database errors.
--
-- SAFE TO APPLY: additive only (create ... if not exists). Nothing existing
-- is dropped or altered. Apply to STAGING first, verify, then production.
--
-- Depends on: engagement_clients, can_view_client(text) and
-- can_manage_client_access(text).
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_cost_lines -- the Cost Model tab, the full cost baseline.
--
--    One row per cost item, tagged with one of the five categories. The
--    five are fixed by the method and must all be present for the floor to
--    mean anything:
--      direct_labour     -- staff and consultant time to deliver once
--      direct_materials  -- what is consumed or produced in delivery
--      travel_logistics  -- travel, accommodation, venue, logistics
--      quality_assurance -- review, revision, verification of the output
--      overhead          -- the share of organisational running costs
--
--    Cost per cycle is qty_per_cycle * unit_cost, and annual cost is that
--    multiplied by annual_deliveries. Both are computed, not stored.
--
--    Overhead is the category most commonly left out. Leaving it out does
--    not produce a lower cost, it produces an incomplete one, so the UI
--    flags overhead below 20 percent of direct costs rather than the
--    database rejecting the row.
-- ------------------------------------------------------------
create table if not exists gtcv_cost_lines (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  category text not null check (category in (
    'direct_labour','direct_materials','travel_logistics','quality_assurance','overhead'
  )),
  item text,                     -- the cost item, in the organisation's words
  unit text,                     -- day, person, set, licence, whatever fits
  qty_per_cycle numeric,         -- how many units one delivery cycle consumes
  unit_cost numeric,             -- cost of one unit, in the engagement currency
  annual_deliveries int,         -- cycles per year, for the annual view
  notes text,                    -- source of the figure, so it can be checked
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_cost_lines_client on gtcv_cost_lines(client_id);
create index if not exists idx_gtcv_cost_lines_category on gtcv_cost_lines(client_id, category);

-- ------------------------------------------------------------
-- 2) gtcv_pricing_tiers -- the Pricing tab, section 3.
--
--    Three tiers are required by the method: Entry (minimum viable, first
--    time clients), Standard (the core service, where break even lives) and
--    Premium (the full ongoing relationship). Two optional tiers may be
--    added once Entry and Standard have been validated in the pilot.
--
--    tier_name is free text rather than an enum on purpose. The method fixes
--    the three roles, not the words an organisation uses for them, and the
--    optional fourth and fifth tiers have no fixed name at all. The UI
--    checks that the three required tiers exist.
--
--    Margin (price minus cost floor) and percent above floor (margin divided
--    by cost floor) are derived, never stored. A price below the floor is a
--    structural deficit and is flagged plainly on the surface.
-- ------------------------------------------------------------
create table if not exists gtcv_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  tier_name text,                -- Entry, Standard, Premium, or the client's own name
  included text,                 -- exactly what the buyer gets at this tier
  target_client text,            -- who this tier is for
  price numeric,                 -- price per delivery, in the engagement currency
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_pricing_tiers_client on gtcv_pricing_tiers(client_id);

-- ------------------------------------------------------------
-- 3) gtcv_market_prices -- the Pricing tab, section 2.
--
--    What comparable providers actually charge, gathered from client
--    research. The method asks for at least three sources before the range
--    is worth reading against the floor, and the UI says so when there are
--    fewer.
--
--    quality_level is free text (High, Mid, Low in the workbook) so a
--    coach can record a more useful judgement than three buckets allow.
-- ------------------------------------------------------------
create table if not exists gtcv_market_prices (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  source text,                   -- the provider or the source of the quote
  price numeric,                 -- the price quoted, in the engagement currency
  quality_level text,            -- High, Mid, Low, or a fuller judgement
  source_date date,              -- when the price was observed, so staleness shows
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_market_prices_client on gtcv_market_prices(client_id);

-- ------------------------------------------------------------
-- 4) gtcv_fixed_costs -- the Pricing tab, section 4.
--
--    Costs the organisation pays whether it delivers or not. Entered
--    monthly, because that is how an organisation knows them, and annualised
--    by the calculation module (monthly total times twelve).
--
--    Break even deliveries per year is annual fixed costs divided by the
--    contribution per delivery, where contribution is price minus the cost
--    floor. That is the workbook rule and the handbook worked example.
-- ------------------------------------------------------------
create table if not exists gtcv_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  item text,                     -- salaries, office, software, marketing, other
  monthly_amount numeric,        -- per month, in the engagement currency
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_fixed_costs_client on gtcv_fixed_costs(client_id);

-- ------------------------------------------------------------
-- RLS: read for anyone who can view the client, write for whoever manages
-- the client. Both helpers already encapsulate the super_coach exception, so
-- the policies below are identical across the four tables.
--
-- policy coach_funder_read on gtcv_cost_lines: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_pricing_tiers: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_market_prices: super_coach, assigned co-implementer, the client's own users and the funder.
-- policy coach_funder_read on gtcv_fixed_costs: super_coach, assigned co-implementer, the client's own users and the funder.
-- ------------------------------------------------------------
alter table gtcv_cost_lines enable row level security;
alter table gtcv_pricing_tiers enable row level security;
alter table gtcv_market_prices enable row level security;
alter table gtcv_fixed_costs enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'gtcv_cost_lines','gtcv_pricing_tiers','gtcv_market_prices','gtcv_fixed_costs'
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
grant select, insert, update, delete on public.gtcv_cost_lines to authenticated;
grant select, insert, update, delete on public.gtcv_pricing_tiers to authenticated;
grant select, insert, update, delete on public.gtcv_market_prices to authenticated;
grant select, insert, update, delete on public.gtcv_fixed_costs to authenticated;
