-- ============================================================
-- PRODUCT CATALOGUE — product dimensions + optional pricing
--
-- Extends the existing field_catalogue (one row = one sellable SKU)
-- so a product carries its category / type / size / supplier, and
-- stamps those same dimensions onto every field_transactions row so
-- sales and COGS can be drilled down by them — WITHOUT changing how
-- the P&L works (the engine still groups only by plan_line_id).
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
--   * dimension ids on field_transactions are denormalised copies
--     written at sync time (same as plan_line_id / unit_label already
--     are), so re-categorising a product later never rewrites history
--     and drill-down is a plain GROUP BY.
--
-- SAFE TO APPLY: every statement is additive or constraint-RELAXING
-- (ADD COLUMN IF NOT EXISTS / DROP NOT NULL / DROP DEFAULT). No data is
-- changed and no existing query breaks (new columns are nullable).
-- Paste into the Supabase SQL editor and Run.
-- ============================================================

-- 1) field_catalogue: product dimensions + size grouping label.
alter table field_catalogue add column if not exists category_id uuid references catalogue_value_lists(id);
alter table field_catalogue add column if not exists type_id     uuid references catalogue_value_lists(id);
alter table field_catalogue add column if not exists size_id     uuid references catalogue_value_lists(id);
alter table field_catalogue add column if not exists supplier_id uuid references catalogue_value_lists(id);
alter table field_catalogue add column if not exists product_name text;

-- 2) field_catalogue: make price optional (upload without prices at setup).
alter table field_catalogue alter column price drop not null;
alter table field_catalogue alter column price drop default;

-- 3) field_catalogue: make the revenue-line link optional (don't force a
--    category->revenue-line mapping).
alter table field_catalogue alter column plan_line_id drop not null;

-- 4) field_transactions: carry the dimensions so sales & COGS drill down.
alter table field_transactions add column if not exists category_id uuid;
alter table field_transactions add column if not exists type_id     uuid;
alter table field_transactions add column if not exists size_id     uuid;
alter table field_transactions add column if not exists supplier_id uuid;

create index if not exists idx_ft_dims
  on field_transactions (client_id, business_unit_id, category_id, type_id, size_id, supplier_id);
