-- ============================================================
-- Clearview: unit label clarity for field transactions
--
-- A quantity like "50" in the transaction history means nothing without
-- knowing whether that's 50kg, 50 bags, or 50 litres. Adds unit_label,
-- captured as a SNAPSHOT at sync time (matching how plan_line_name is
-- already captured this way) -- not joined live from field_catalogue at
-- display time, since a catalogue item's unit_label can be edited later
-- and a historical transaction should show what was true when it
-- actually happened, not the catalogue's current state.
-- ============================================================

alter table field_transactions
  add column if not exists unit_label text;
