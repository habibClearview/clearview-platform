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

-- 1) Allow 'segment' as a value-list kind.
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
