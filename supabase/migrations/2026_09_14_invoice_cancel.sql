-- Cancelling an invoice. 14 September 2026.
--
-- Habib: "I cant remove the test invoice I put on there which is showing as
-- outstanding. I should be able to reject an invoice or remove from the
-- account until accepted."
--
-- An issued invoice was final. A test run, or one issued against the wrong
-- period, sat on the account permanently: counted as money owed, counted as
-- cost to serve, and blocking the real invoice for that period from ever
-- being issued, because a co-implementer can only have one live invoice per
-- period.
--
-- Cancelling is now possible while it is unpaid. The row stays, so the
-- history still shows that a number was used and withdrawn, and only a
-- cancelled invoice can then be removed from the account altogether.
--
-- Cancelling also puts back every advance the invoice retired. That happens
-- in the application, in cancelInvoice in src/components/coach/TeamPayments.tsx,
-- because it is the same place that knows which advances an invoice took.
alter table coach_invoices
  add column if not exists cancelled_at timestamptz;

comment on column coach_invoices.cancelled_at is
  'When the invoice was withdrawn. Set together with status = cancelled. Null on every live invoice.';

comment on column coach_invoices.status is
  'draft | issued | paid | cancelled. A cancelled invoice is ignored wherever a live one is counted: outstanding money, invoiced this period, cost to serve, and the one-live-invoice-per-period rule.';
