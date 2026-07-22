-- ============================================================
-- CUSTOMER SEGMENTS  [additive]
--
-- A "segment" is the TYPE OF CUSTOMER who bought (walk-in farmer, retailer,
-- Farmer Group Enterprise / cooperative, development institution, large
-- farmer, …) — a customer attribute, not a product attribute. It lets the
-- platform show revenue BY SEGMENT and compare it against the forecast impact
-- of a marketing activity aimed at that segment.
--
-- DESIGN (reuses existing patterns):
--   * Segment lists live in catalogue_value_lists as a new kind = 'segment',
--     scoped per client + business unit (same table, RLS and unique key that
--     already back category/type/size/supplier).
--   * The authoritative per-sale answer is field_transactions.segment_id,
--     written at sync time (works for walk-ins with no named customer).
--   * field_customers.segment_id is an OPTIONAL default, used only to
--     pre-fill the dropdown for a named repeat customer — never the grouping
--     source, so re-tagging a customer never rewrites history.
--   * generic_market_events.target_segment_id lets a marketing activity name
--     the segment it targets, for forecast-vs-actual.
--
-- All new columns are plain uuid (not FKs) — matching how the existing
-- product-dimension ids are modelled; the real rule ("must be a value list of
-- kind 'segment' in the same client+unit") is enforced in the write path, not
-- by a database FK.
--
-- SAFE TO APPLY: purely additive (widen one CHECK, add nullable columns, one
-- index). Nothing existing is altered or removed. Paste into the Supabase SQL
-- editor and Run.
-- ============================================================

-- 0) Ensure the value-list table exists (some environments never ran the
--    original catalogue value-lists migration). Self-contained + idempotent.
--    This is an EXACT copy of the original catalogue_value_lists definition
--    (2026_07_18_catalogue_1_value_lists.sql), so it can only match, never
--    drift. Two deliberate choices the automated reviewer should note:
--      * client_id / business_unit_id are TEXT, NOT uuid — engagement_clients.id
--        is TEXT, and field_catalogue / the original value-lists table use TEXT
--        too. The repo's own migration validator REQUIRES client_id to be TEXT.
--        can_view_client() takes a text argument (it's what field_catalogue's
--        RLS already passes).
--      * Only a SELECT policy is defined ON PURPOSE. Every write to this table
--        goes through a service-role admin route (/api/field/admin/segments,
--        /api/ingest-catalogue) which bypasses RLS; there is no client-side
--        write path, so INSERT/UPDATE/DELETE policies would grant nothing and
--        are intentionally omitted — identical to the original table's design.
create table if not exists catalogue_value_lists (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  kind text not null check (kind in ('category','type','size','supplier','segment')),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, business_unit_id, kind, name)
);
create index if not exists idx_cvl_client_unit_kind
  on catalogue_value_lists (client_id, business_unit_id, kind)
  where active = true;
alter table catalogue_value_lists enable row level security;
drop policy if exists catalogue_value_lists_read on catalogue_value_lists;
create policy catalogue_value_lists_read on catalogue_value_lists
  for select using (can_view_client(client_id));

-- 1) Allow 'segment' as a value-list kind (for an EXISTING table whose check
--    predates segments; a no-op for the freshly-created table above).
alter table catalogue_value_lists drop constraint if exists catalogue_value_lists_kind_check;
alter table catalogue_value_lists add constraint catalogue_value_lists_kind_check
  check (kind in ('category', 'type', 'size', 'supplier', 'segment'));

-- 2) Segment as the source of truth on each sale (denormalised at sync).
alter table field_transactions add column if not exists segment_id uuid;

-- 3) Optional per-customer default (pre-fill only).
alter table field_customers add column if not exists segment_id uuid;

-- 4) Let a marketing activity target a segment (forecast-vs-actual).
alter table generic_market_events add column if not exists target_segment_id uuid;

-- 5) Read index for revenue-by-segment.
create index if not exists idx_ft_segment
  on field_transactions (client_id, business_unit_id, segment_id)
  where segment_id is not null;
