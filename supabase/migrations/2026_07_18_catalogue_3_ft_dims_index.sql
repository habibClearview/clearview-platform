-- ============================================================
-- PRODUCT CATALOGUE — field_transactions dimension index   [step 3 of 3]
--
-- Index supporting catalogue drill-down (sales/COGS grouped by
-- category/type/size/supplier) over field_transactions.
--
-- field_transactions is a LIVE table that receives field sales, so this
-- index is built with CREATE INDEX CONCURRENTLY to avoid locking writes
-- (which would stall field sync / actuals) while it builds.
--
-- ⚠️ RUN THIS FILE ON ITS OWN. CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block. In the Supabase SQL editor, run this file
-- separately from the other statements. Run it AFTER
-- …_catalogue_2_product_dimensions (which adds the columns).
--
-- SAFE TO APPLY: additive, IF NOT EXISTS, non-blocking.
-- ============================================================

create index concurrently if not exists idx_ft_dims
  on field_transactions (client_id, business_unit_id, category_id, type_id, size_id, supplier_id);
