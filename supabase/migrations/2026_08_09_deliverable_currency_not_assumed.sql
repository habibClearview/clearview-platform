-- ============================================================
-- A deliverable no longer starts out priced in dollars.
--
-- engagement_deliverables.payment_currency was declared not null with a default
-- of 'USD'. So every milestone read from a contract, and every one added by
-- hand, arrived denominated in US dollars whether or not the contract said so,
-- and the claim assembled from it carried that forward onto the document a
-- funder reads.
--
-- This is the same fault the interface had in seven places and it was fixed
-- there: an amount whose currency nobody chose should print as a plain number,
-- not claim one. A default in the database undoes that fix silently, because
-- the value looks deliberate by the time anything reads it.
--
-- ADDITIVE AND NON DESTRUCTIVE. The default is dropped and the column is made
-- nullable. Rows that already say USD keep saying USD, because some of them
-- mean it and this migration cannot tell which. What changes is what happens
-- next: a new deliverable holds no currency until somebody sets one.
-- ============================================================

alter table public.engagement_deliverables
  alter column payment_currency drop default;

alter table public.engagement_deliverables
  alter column payment_currency drop not null;

comment on column public.engagement_deliverables.payment_currency is
  'The currency this milestone is paid in. Null means nobody has set one yet, and the amount prints without a currency rather than claiming one. Never defaulted: a client can be anywhere.';

-- The same assumption on the claim itself, for the same reason. The pack copies
-- the deliverable's currency at assembly time, so a default here would put a
-- currency on a claim whose deliverable deliberately had none.
alter table public.engagement_invoice_packs
  alter column currency drop default;

alter table public.engagement_invoice_packs
  alter column currency drop not null;

comment on column public.engagement_invoice_packs.currency is
  'Copied from the deliverable when the claim is assembled. Null when the deliverable has no currency set.';
