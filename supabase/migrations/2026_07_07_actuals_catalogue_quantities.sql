-- ============================================================
-- Clearview: catalogue-priced manual actuals entry
--
-- Adds catalogue_quantities to generic_actuals, storing the quantity
-- breakdown behind a manually-entered line_values total when the coach
-- used catalogue-driven entry (pick an item from field_catalogue, price
-- pre-filled, only quantity typed in -- the same mechanism the field
-- app already uses for operators). Without this, the quantity
-- breakdown would be lost on reload, leaving only the round-figure
-- total, forcing the coach to re-derive "how many of what" every time
-- they revisit a period.
--
-- Shape: { [plan_line_id]: { [catalogue_item_id]: quantity } }
--
-- line_values remains the single source of truth actually used by the
-- engine and every downstream calculation -- catalogue_quantities is
-- purely a UI-fidelity aid for re-populating the entry form, computed
-- from and validated against line_values at write time, never read by
-- the engine itself.
-- ============================================================

alter table generic_actuals
  add column if not exists catalogue_quantities jsonb not null default '{}'::jsonb;
