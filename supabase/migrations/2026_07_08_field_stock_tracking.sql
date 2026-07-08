-- ============================================================
-- Clearview: field stock tracking
--
-- Two tables: field_stock_levels holds the CURRENT on-hand quantity per
-- catalogue item per business unit (the number an operator actually
-- checks before promising a customer stock); field_stock_movements is
-- the full ledger of every change (sale, stock received, manual
-- adjustment, transfer in/out) -- the audit trail behind that current
-- number, never just an editable balance with no history.
-- ============================================================

create table if not exists field_stock_levels (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  catalogue_item_id uuid not null references field_catalogue(id) on delete cascade,
  quantity_on_hand numeric not null default 0,
  reorder_threshold numeric,
  updated_at timestamptz not null default now(),
  unique (business_unit_id, catalogue_item_id)
);

create table if not exists field_stock_movements (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  business_unit_id text not null,
  catalogue_item_id uuid not null references field_catalogue(id) on delete cascade,
  movement_type text not null check (movement_type in ('sale','stock_in','adjustment','transfer_out','transfer_in')),
  -- Positive for stock_in/transfer_in/positive adjustments; negative for
  -- sale/transfer_out/negative adjustments. quantity_on_hand is always
  -- the running sum of every movement for that (unit, item) pair --
  -- never edited directly, only derived from this ledger.
  quantity numeric not null,
  reference_id text,
  transfer_pair_id uuid,
  notes text,
  operator_id uuid references field_operators(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_field_stock_movements_lookup on field_stock_movements(business_unit_id, catalogue_item_id, created_at desc);

alter table field_stock_levels enable row level security;
alter table field_stock_movements enable row level security;

create policy client_scoped_stock_levels on field_stock_levels
  for all using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );

create policy client_scoped_stock_movements on field_stock_movements
  for all using (
    my_role() = 'super_coach' or client_id = my_engagement_client_id()
  );
