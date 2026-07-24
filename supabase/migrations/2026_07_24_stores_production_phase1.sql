-- ============================================================
-- Stores & Production — Phase 1 (operational tracker)
-- ============================================================
-- Additive groundwork so a client can track inputs, production, finished
-- goods, breakage and sales across their OWN locations and channels — with
-- everything client-configured and nothing hardcoded. Reuses the existing
-- stock ledger (field_stock_movements), catalogue and per-client value lists.
--
-- This migration is ADDITIVE ONLY: new nullable columns, widened CHECK
-- constraints, and new indexes. No table is created, no data is deleted, and
-- every existing row/flow keeps working unchanged (all new columns default to
-- NULL / the existing behaviour).
--
-- Run on STAGING first, confirm, then production.
-- ============================================================

-- 1) Client-configurable lists: allow two NEW kinds in the existing value list.
--    'location'    — the client's own places (Farm, Retail Store, Warehouse…)
--    'loss_reason' — the client's own words for a loss (Breakage, Mortality…)
--    (Sales CHANNELS are NOT added here — they already exist as the client's
--     config.settings.channels list and are reused, never duplicated.)
--    The new value set is a strict SUPERSET of the previous one, so re-adding
--    the CHECK can never reject an existing row.
alter table catalogue_value_lists drop constraint if exists catalogue_value_lists_kind_check;
alter table catalogue_value_lists add constraint catalogue_value_lists_kind_check
  check (kind in ('category', 'type', 'size', 'supplier', 'segment', 'location', 'loss_reason'));

-- 1a) Guarantee the unique key the value-list upserts rely on
--     (client_id, business_unit_id, kind, name) exists. It is created inline
--     with the table in the original catalogue_value_lists migration, so this is
--     a defensive no-op on any up-to-date database — it only (re)creates the key
--     if some environment is somehow missing it, so the admin API's ON CONFLICT
--     target is always present and this migration stands on its own. The check
--     compares column SETS, so it matches regardless of the existing key's name
--     or column order.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.catalogue_value_lists'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['business_unit_id', 'client_id', 'kind', 'name']
  ) then
    alter table catalogue_value_lists
      add constraint catalogue_value_lists_client_unit_kind_name_key
      unique (client_id, business_unit_id, kind, name);
  end if;
end $$;

-- 2) Inputs as a kind of catalogue item. An "input" is something the business
--    buys and uses up (feed, chicks, vaccines, trays) — as opposed to a
--    'product'/'service' it sells. Its price column, when set, is the optional
--    unit COST (used by Phase 2; ignored by Phase 1's quantity tracking).
--    Superset of the prior set ('product','service') — cannot reject any row.
alter table field_catalogue drop constraint if exists field_catalogue_item_type_check;
alter table field_catalogue add constraint field_catalogue_item_type_check
  check (item_type in ('product', 'service', 'input'));

-- 3) Movement types that match the real world, added to the ledger's existing
--    set. 'issue' = released to production (out of an input holder); 'produced'
--    = collected/made (into a product holder); 'loss' = breakage/mortality/
--    spoilage (out, carrying a reason). stock_in / transfer_out / transfer_in /
--    sale / adjustment are unchanged. The new set lists ALL five prior values
--    plus the three new ones — a strict superset — so re-adding the CHECK
--    revalidates existing rows without any possibility of failure.
alter table field_stock_movements drop constraint if exists field_stock_movements_movement_type_check;
alter table field_stock_movements add constraint field_stock_movements_movement_type_check
  check (movement_type in (
    'sale', 'stock_in', 'adjustment', 'transfer_out', 'transfer_in',
    'issue', 'produced', 'loss'
  ));

-- 4) A movement's HOLDER can now be a place, and a loss can carry a reason.
--    holder = the location the stock sits at (location_id), OR the person
--    carrying it (the existing operator_id column). Balances are computed by
--    summing the ledger per (item, holder) — field_stock_levels is untouched.
--    Both reference the client's own value-list rows; on delete of a list row
--    the tag simply clears (SET NULL) rather than blocking or cascading.
alter table field_stock_movements
  add column if not exists location_id uuid references catalogue_value_lists(id) on delete set null;
alter table field_stock_movements
  add column if not exists reason_id uuid references catalogue_value_lists(id) on delete set null;

-- 5) The sales-channel tag on an actual sale. TEXT, because it references an id
--    inside the client's config.settings.channels JSON list (the SAME channels
--    used in planning and available to the field app) — not a table row, so no
--    FK. Validated against the client's own channels server-side on sync.
alter table field_transactions
  add column if not exists channel_id text;

-- 6) Let a Marketing Activity optionally target one of those same channels, so
--    "a push for the Mobile shop channel" reuses the one channel list. Same
--    TEXT/config.settings.channels reference as the sale tag above.
alter table generic_market_events
  add column if not exists target_channel_id text;

-- 7) Indexes for the new read patterns: per-holder stock balances, and
--    sales-by-channel reporting. Partial/where-not-null keeps them small.
create index if not exists idx_fsm_holder
  on field_stock_movements (client_id, business_unit_id, catalogue_item_id, location_id);
create index if not exists idx_fsm_operator_holder
  on field_stock_movements (client_id, business_unit_id, catalogue_item_id, operator_id)
  where operator_id is not null;
create index if not exists idx_ft_channel
  on field_transactions (client_id, business_unit_id, channel_id)
  where channel_id is not null;
