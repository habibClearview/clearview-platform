-- ============================================================
-- Clearview Field: Catalogue + delegated permission migration
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- 1. Catalogue: every product/service a business unit sells, with its
--    current price. This is the single source of truth for pricing --
--    field operators never enter a price, only a volume.
create table if not exists field_catalogue (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  -- Which revenue plan line's actuals this item's transactions roll up
  -- into. One plan line (e.g. "Maize Sales") can have several catalogue
  -- items (e.g. "Maize 50kg bag", "Maize 90kg bag") feeding it.
  plan_line_id text not null,
  name text not null,
  item_type text not null default 'product' check (item_type in ('product','service')),
  price numeric not null default 0,
  unit_label text, -- e.g. 'bag', 'session', 'kg' -- optional, for display only
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_field_catalogue_client_unit
  on field_catalogue (client_id, business_unit_id) where active = true;

-- 2. Delegated permission: CEO or Finance Manager grants a specific
--    staff member the right to manage the catalogue for their unit(s).
--    This is separate from broad team-management rights.
alter table user_profiles
  add column if not exists can_manage_catalogue boolean not null default false;

-- 3. field_transactions: link each transaction back to the catalogue
--    item it was recorded against, and flag bulk price overrides so
--    they're auditable rather than silently changing the standard price.
alter table field_transactions
  add column if not exists catalogue_item_id uuid references field_catalogue(id);
alter table field_transactions
  add column if not exists price_overridden boolean not null default false;
alter table field_transactions
  add column if not exists price_alert boolean not null default false;

-- 4. RLS: catalogue data is only ever written/read through server-side
--    API routes using the service role key (same pattern as
--    field_operators, field_operator_tokens, and every other Clearview
--    Field table) -- enabling RLS with no permissive policy blocks any
--    accidental direct browser access.
alter table field_catalogue enable row level security;
