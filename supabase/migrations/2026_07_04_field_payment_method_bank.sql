-- ============================================================
-- Clearview Field: allow 'bank' as a payment method
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Root cause of every field sync failing since launch: the mobile
-- capture page offers "Bank Transfer" (value 'bank') as a payment
-- method, but the database check constraint only ever allowed
-- 'cash', 'credit', 'mobile_money'. Every single sync attempt that
-- included a bank transfer was rejected outright -- and because the
-- error message was a raw Postgres constraint violation, the operator
-- had no way to know what went wrong or that it was even their choice
-- of payment method causing it.
-- ============================================================

alter table field_transactions drop constraint if exists field_transactions_payment_method_check;
alter table field_transactions add constraint field_transactions_payment_method_check
  check (payment_method = ANY (ARRAY['cash'::text, 'credit'::text, 'mobile_money'::text, 'bank'::text]));
