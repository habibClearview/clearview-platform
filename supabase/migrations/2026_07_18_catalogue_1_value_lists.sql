-- ============================================================
-- PRODUCT CATALOGUE — value lists (dropdown definitions)   [step 1 of 3]
--
-- Defines the pre-set dropdown values a product is built from:
-- category, type, size, and supplier/brand. One row = one choice in
-- one of those four lists, scoped to a client + business unit.
--
-- Why one table with a `kind` column (not four tables): one table,
-- one admin route, one management screen, one RLS grant — materially
-- less to build and maintain per business unit.
--
-- Follows the existing field_catalogue pattern exactly:
--   * client_id / business_unit_id are TEXT (engagement ids),
--   * writes go through the service-role admin API only (no
--     permissive write policy here),
--   * reads are client-scoped via can_view_client() — the same
--     helper field_catalogue reads are granted through
--     (2026_07_13_funder_coimplementer_access.sql).
--
-- RUN ORDER: this file (…_catalogue_1_…) must run BEFORE
-- …_catalogue_2_product_dimensions and …_catalogue_3_ft_dims_index.
--
-- SAFE TO APPLY: purely additive (new table, IF NOT EXISTS). Nothing
-- existing is altered. Paste into the Supabase SQL editor and Run.
-- ============================================================

create table if not exists catalogue_value_lists (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  kind text not null check (kind in ('category','type','size','supplier')),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No duplicate values within the same list for the same unit.
  unique (client_id, business_unit_id, kind, name)
);

-- New, empty table — this index builds instantly, no lock concern.
create index if not exists idx_cvl_client_unit_kind
  on catalogue_value_lists (client_id, business_unit_id, kind)
  where active = true;

alter table catalogue_value_lists enable row level security;

-- Reads: client-scoped, same helper field_catalogue uses. super_coach
-- (Habib) sees all; a client's own users see only their client's lists;
-- coach/funder see the clients they're entitled to. Writes are
-- service-role only (the admin API), so no write policy is defined here.
drop policy if exists catalogue_value_lists_read on catalogue_value_lists;
create policy catalogue_value_lists_read on catalogue_value_lists
  for select using (can_view_client(client_id));
