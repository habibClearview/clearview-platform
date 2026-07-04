-- ============================================================
-- Clearview Actuals: separate field-derived and manually-entered figures
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Per docs/ACCOUNTING_ARCHITECTURE.md section 4. Bug fixed: previously,
-- aggregate_field_transactions() overwrote generic_actuals.line_values
-- directly. If an accountant manually entered a figure for the same
-- line (a paper-only store), the next field sync would silently erase
-- it. Fix: field-derived and manually-entered amounts now live in
-- separate columns that only one writer ever touches, summed together
-- only when displayed. Neither can ever clobber the other because they
-- never touch the same field.
-- ============================================================

alter table generic_actuals
  add column if not exists field_line_values jsonb not null default '{}'::jsonb;

comment on column generic_actuals.line_values is
  'Manually entered figures only -- edited directly by an accountant/finance assistant. Never written to by aggregate_field_transactions(). Combine with field_line_values for the true total per line.';
comment on column generic_actuals.field_line_values is
  'Field-app-derived figures only -- written exclusively by aggregate_field_transactions(). Never edited by hand. Combine with line_values for the true total per line.';
