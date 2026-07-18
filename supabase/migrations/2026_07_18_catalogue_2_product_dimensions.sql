-- ============================================================
-- PRODUCT CATALOGUE — product dimensions + optional pricing   [step 2 of 3]
--
-- Extends the existing field_catalogue (one row = one sellable SKU)
-- so a product carries its category / type / size / supplier, and
-- mirrors those dimensions onto field_transactions so sales and COGS
-- can be drilled down by them — WITHOUT changing how the P&L works
-- (the engine still groups only by plan_line_id).
--
-- Design notes:
--   * Each field_catalogue row stays one SKU = product x size. The new
--     product_name is the size-agnostic label ("Maize", "Coca-Cola");
--     size_id is the variant. The field app groups tiles by
--     product_name, then offers the size list. Price stays per-row, so
--     "Coke != Pepsi" and "50cl != 1L" prices fall out naturally.
--   * price becomes optional so products can be uploaded at setup with
--     no price yet. (Selling a product still requires a price — that is
--     enforced in the field-capture step, not here.)
--   * plan_line_id becomes nullable so a product need not be forced onto
--     a specific revenue line. Revenue still lands in the P&L via a
--     single default "Product Sales" revenue line per unit (assigned in
--     app code), keeping category/type/size/supplier as pure drill-down.
--   * The four dimension columns are plain uuid (NOT database foreign
--     keys) — deliberately matching how field_catalogue.plan_line_id
--     already works (a bare text id, no FK). A hard uuid FK could not
--     express the two rules that actually matter here — the id must be
--     a value list of the RIGHT KIND and belong to the SAME client+unit
--     — and would give false confidence while also locking the table on
--     apply. Those rules are enforced where the ids are set: the
--     catalogue admin + import routes only ever write an id looked up
--     from catalogue_value_lists for that client, unit and kind.
--   * dimension ids on field_transactions are denormalised copies
--     written at sync time (same as plan_line_id / unit_label already
--     are), so re-categorising a product later never rewrites history.
--
-- RUN ORDER: run …_catalogue_1_value_lists BEFORE this file, and
-- …_catalogue_3_ft_dims_index AFTER it.
--
-- SAFE TO APPLY: every statement is additive or constraint-RELAXING
-- (ADD COLUMN IF NOT EXISTS / DROP NOT NULL / DROP DEFAULT). No data is
-- changed and no existing query breaks (new columns are nullable).
-- Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) field_catalogue: product dimensions (plain uuid; see note above) +
--    size-grouping label.
alter table field_catalogue add column if not exists category_id uuid;
alter table field_catalogue add column if not exists type_id     uuid;
alter table field_catalogue add column if not exists size_id     uuid;
alter table field_catalogue add column if not exists supplier_id uuid;
alter table field_catalogue add column if not exists product_name text;

-- 2) field_catalogue: make price optional (upload without prices at setup).
alter table field_catalogue alter column price drop not null;
alter table field_catalogue alter column price drop default;

-- 3) field_catalogue: make the revenue-line link optional (don't force a
--    category->revenue-line mapping).
alter table field_catalogue alter column plan_line_id drop not null;

-- 4) field_transactions: carry the dimensions so sales & COGS drill down.
--    (The supporting index is created concurrently in step 3, so it does
--     not lock this live table.)
alter table field_transactions add column if not exists category_id uuid;
alter table field_transactions add column if not exists type_id     uuid;
alter table field_transactions add column if not exists size_id     uuid;
alter table field_transactions add column if not exists supplier_id uuid;
