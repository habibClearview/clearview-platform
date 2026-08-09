-- ============================================================
-- The currency the engagement works in.
--
-- WHY THERE WASN'T ONE. The cost stack, the pricing tiers, the market prices
-- and the pipeline all hold money, and every one of them rendered as a bare
-- number: 25,000 with nothing to say what 25,000 is. The formatter takes a
-- currency and prints the amount alone when it does not get one, and no caller
-- ever passed one, because there was nowhere to pass it from.
--
-- engagement_clients has fee_currency, and it is the wrong field. That is what
-- the consultant invoices in, it belongs to the private commercial layer, and
-- the organisation being coached has no part in it. An engagement in Nigeria
-- prices its services in naira while the consultant is paid in dollars, and
-- collapsing the two would put the fee currency in front of the client on
-- every cost line.
--
-- So it goes on engagement_config, next to the other things that are set per
-- engagement and never in code: what the blocks are called, how many
-- conversations a segment needs, which independence tests apply. Null is a
-- real answer and stays the default, because an engagement that has not
-- decided should show bare numbers rather than be given a guess. Nothing is
-- defaulted to USD or to anything else: guessing a currency on money is worse
-- than showing none.
--
-- Additive. One nullable column, no data touched.
-- ============================================================

alter table public.engagement_config
  add column if not exists currency text;

comment on column public.engagement_config.currency is
  'The currency this engagement prices and costs in, as a short code such as NGN or USD. Null means not yet decided, and amounts print without a currency. This is the client''s working currency and is deliberately not the consultant''s fee currency, which lives on engagement_clients.fee_currency.';
