-- ============================================================
-- GtCV workbook working tables (set A): the three tables a coach and an
-- LSP fill in live during DP01, DP06 and DP08.
--
-- WHY: the canvas layer records the DECISION at each gate, but the work
-- that produces the decision happens on a workbook table. Until now those
-- tables lived in Word and Excel files outside the platform, so the
-- evidence behind a gate could not be seen, edited or carried forward.
-- These three tables put that work in the product:
--
--   gtcv_service_inventory  DP01 Service Reality Audit. One row per service:
--                           what it delivers, whether it runs on grant logic
--                           or market logic, whether demand is genuine, the
--                           hidden delivery costs, the quality risk, and the
--                           keep / redesign / pause / stop decision.
--   gtcv_partner_map        DP06 Partner Categorisation. One row per partner:
--                           the relationship type, what each side brings and
--                           needs, and whether the partnership strengthens or
--                           compromises commercial positioning.
--   gtcv_channel_logic      DP08 Channel Logic. One row per segment: the entry
--                           or scale channel, why that channel reaches that
--                           segment, whether it works without programme
--                           facilitation, the evidence still needed, and the
--                           first action with a timeline.
--
-- CONVENTIONS (matching the existing schema):
--   * client_id is TEXT and references engagement_clients(id) on delete
--     cascade, exactly like engagement_parties and engagement_deliverables.
--   * RLS reuses the established helpers: can_view_client(text) for read
--     (super_coach, assigned co-implementer, the client's own users and the
--     programme funder) and can_manage_client_access(text) for write
--     (super_coach or the assigned co-implementer only).
--   * Every new table also gets an explicit grant to authenticated; RLS
--     then decides which rows that role actually sees.
--   * Free-text everywhere the workbook is free text. The select columns
--     carry a check constraint but allow NULL, so a half filled row saves
--     rather than erroring while the conversation is still running.
--
-- CLIENT AGNOSTIC: no client, service, partner, segment or channel is named
-- here. Every row is data entered per engagement.
--
-- SAFE TO APPLY: additive only (create ... if not exists, policies dropped
-- and recreated by name). Nothing existing is dropped or altered. Apply to
-- the STAGING Supabase project first (see docs/STAGING_AND_ROLLBACK.md),
-- verify, then production. Paste into the Supabase SQL editor and Run.
--
-- Depends on: engagement_clients, and can_view_client(text) /
-- can_manage_client_access(text) from
-- 2026_07_13_funder_coimplementer_access.sql and
-- 2026_07_13_client_access_grants.sql. Run those first if not applied.
-- ============================================================

-- ------------------------------------------------------------
-- 1) gtcv_service_inventory (DP01 Service Reality Audit)
--    One row per service the organisation currently delivers.
-- ------------------------------------------------------------
create table if not exists gtcv_service_inventory (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  -- The service as the organisation names it internally.
  service_name text,
  -- What the service actually delivers, in plain language.
  what_it_delivers text,
  -- Grant logic (it exists because a donor funds it) or market logic (it
  -- exists because a customer buys it). 'mixed' is common and honest.
  logic_type text check (logic_type is null or logic_type in ('grant','market','mixed','unclear')),
  -- Is there genuine demand, or is this donor driven supply?
  has_demand text check (has_demand is null or has_demand in ('yes','no','unsure')),
  -- Costs the current budget does not show: staff time, travel, supervision,
  -- rework, the coordination overhead nobody prices.
  hidden_delivery_costs text,
  -- What could go wrong in delivery quality at real volume.
  delivery_quality_risk text,
  -- The DP01 decision this row drives.
  decision text check (decision is null or decision in ('keep','redesign','pause','stop')),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_service_inventory_client on gtcv_service_inventory(client_id);

-- ------------------------------------------------------------
-- 2) gtcv_partner_map (DP06 Partner Categorisation)
--    One row per partner, categorised by what the relationship really is.
-- ------------------------------------------------------------
create table if not exists gtcv_partner_map (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  partner_name text,
  -- The real relationship type. 'conflict' is deliberately a category: a
  -- partner who competes for the same buyer has to be named as such.
  partner_type text check (partner_type is null or partner_type in ('referral','co_delivery','endorsement','conflict')),
  -- What the partner brings to the table.
  what_they_bring text,
  -- What the partner needs from this organisation in return.
  what_they_need text,
  -- Does the relationship strengthen or compromise commercial positioning?
  positioning_effect text check (positioning_effect is null or positioning_effect in ('strengthens','neutral','compromises','unclear')),
  -- The action agreed on this partner.
  action text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_partner_map_client on gtcv_partner_map(client_id);

-- ------------------------------------------------------------
-- 3) gtcv_channel_logic (DP08 Channel Logic)
--    One row per segment: how the organisation reaches it, and whether that
--    route survives without the programme in the room.
-- ------------------------------------------------------------
create table if not exists gtcv_channel_logic (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references engagement_clients(id) on delete cascade,
  segment text,
  -- Is this channel the way in, or the way to grow once in?
  entry_or_scale text check (entry_or_scale is null or entry_or_scale in ('entry','scale','both')),
  channel text,
  -- Why this channel reaches this segment. The reasoning, not the label.
  channel_logic text,
  -- The independence test: does this channel work without the programme
  -- facilitating the introduction?
  independent_of_facilitation boolean not null default false,
  -- What still has to be proven before this channel can be relied on.
  evidence_needed text,
  first_action text,
  -- Free text, for example 'within 6 weeks' or 'Q4'.
  timeline text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gtcv_channel_logic_client on gtcv_channel_logic(client_id);

-- ------------------------------------------------------------
-- RLS: read for anyone who can view the client, write for whoever manages
-- it. Both helpers already encapsulate the super_coach exception, so no
-- separate super_coach policy is needed. Enabled explicitly per table.
-- ------------------------------------------------------------
alter table gtcv_service_inventory enable row level security;
alter table gtcv_partner_map enable row level security;
alter table gtcv_channel_logic enable row level security;

-- gtcv_service_inventory
drop policy if exists coach_funder_read on gtcv_service_inventory;
create policy coach_funder_read on gtcv_service_inventory for select -- read: super_coach, co-implementer, client users, funder
  using (can_view_client(client_id));

drop policy if exists coach_manage on gtcv_service_inventory;
create policy coach_manage on gtcv_service_inventory for all -- write: super_coach or the assigned co-implementer only
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- gtcv_partner_map
drop policy if exists coach_funder_read on gtcv_partner_map;
create policy coach_funder_read on gtcv_partner_map for select -- read: super_coach, co-implementer, client users, funder
  using (can_view_client(client_id));

drop policy if exists coach_manage on gtcv_partner_map;
create policy coach_manage on gtcv_partner_map for all -- write: super_coach or the assigned co-implementer only
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- gtcv_channel_logic
drop policy if exists coach_funder_read on gtcv_channel_logic;
create policy coach_funder_read on gtcv_channel_logic for select -- read: super_coach, co-implementer, client users, funder
  using (can_view_client(client_id));

drop policy if exists coach_manage on gtcv_channel_logic;
create policy coach_manage on gtcv_channel_logic for all -- write: super_coach or the assigned co-implementer only
  using (can_manage_client_access(client_id))
  with check (can_manage_client_access(client_id));

-- ------------------------------------------------------------
-- Grants. RLS still decides the rows; without the grant the role cannot
-- reach the table at all.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.gtcv_service_inventory to authenticated;
grant select, insert, update, delete on public.gtcv_partner_map to authenticated;
grant select, insert, update, delete on public.gtcv_channel_logic to authenticated;
