-- ============================================================
-- Clearview Field: allow 'cogs_auto' as a transaction_type
-- Run this in the Supabase SQL Editor (Project sxsenbvaitpnumdwvxaj)
--
-- Root cause, found via live end-to-end verification immediately after
-- deploying standard costing: field_transactions_transaction_type_check
-- only ever allowed 'sale', 'cost', 'expense' -- the exact same class of
-- bug as the earlier payment_method constraint gap. Every sale for a
-- catalogue item with a cost price set would have failed outright the
-- moment it tried to insert its automatic COGS row.
-- ============================================================

alter table field_transactions drop constraint if exists field_transactions_transaction_type_check;
alter table field_transactions add constraint field_transactions_transaction_type_check
  check (transaction_type = ANY (ARRAY['sale'::text, 'cost'::text, 'expense'::text, 'cogs_auto'::text]));
