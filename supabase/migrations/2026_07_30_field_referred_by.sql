-- ============================================================
-- FIELD SALE — referred-by (sourcing credit at the till)  [additive]
--
-- The shopkeeper can tag which STAFF member (a Sales & Marketing recruiter)
-- referred the customer when recording a sale in the field app. This is what
-- lets sales VALUE be credited back to the person who recruited the customer,
-- separate from operator_id (who served the sale).
--
-- Nullable: older field-app clients simply don't send it, exactly like
-- captured_at / segment_id. The field sync validates the id belongs to this
-- client before storing it, and has a "column not found → retry" fallback so
-- sales still sync if this migration hasn't been applied yet.
--
-- SAFE TO APPLY: additive + idempotent. One column + one index. Requires the
-- `staff` table (2026_07_28_staff.sql).
-- ============================================================

alter table field_transactions
  add column if not exists referred_by_staff_id uuid references staff(id);

create index if not exists idx_field_transactions_referred_by
  on field_transactions (referred_by_staff_id);
