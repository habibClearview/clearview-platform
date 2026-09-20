# The evidence problem: a briefing

Written to be taken elsewhere. It assumes no knowledge of the ClearView code
and is meant to let a conversation with no access to the platform be useful.

Written 20 September 2026 by Habib Onifade with Claude Code, from the platform
as it actually stands rather than as it is described in a pitch.

---

## 1. What ClearView is, in one paragraph

A platform used by a coach and an organisation together, to take a service that
was built with grant money and make it earn revenue from paying customers.
Eleven decisions in a fixed order, each closing on evidence and signed by the
chief executive. Underneath the coaching it carries a full financial model, a
phone application that field staff use to log sales and costs offline, a product
catalogue, stock, and a reconciliation layer that matches logged sales against
mobile money payments. It runs live engagements in Nigeria, Kenya and Uganda,
funded by donors.

## 2. What is actually built

Relevant to this discussion, and all of it working rather than planned:

- **A financial model** that runs as one self-contained calculation: hand it a
  configuration and a set of actual figures and it returns projections, profit
  and loss per business unit, cash, debt schedules and scenarios. It touches no
  database, so it can be run on anybody's numbers without storing them.
- **A field application** used by staff on phones with no signal. Sales and
  costs are queued and synced later, each carrying an identifier so a repeated
  send cannot book the same sale twice. It captures cash, credit and mobile
  money, per product, per business unit, per customer.
- **A reconciliation layer.** Mobile money payments arrive as normalised
  records. Each is either matched to a logged sale, unattributed, or ignored.
  Matched means two independent records of one event agreed.
- **Confidence banding.** Rather than declaring revenue verified or not, the
  platform grades it: what share of declared revenue was independently
  confirmed, how consistent the reporting has been, whether the books were
  closed on time. Absence of verification is explained rather than punished.
- **A portfolio view** across every engagement: readiness stages, ranked
  reasons engagements fail, performance by sector, fund absorption capacity,
  and an anonymised profile per organisation.
- **A monthly record**, added 20 September 2026, that files one reading per
  engagement per month so movement can be seen rather than only position.

## 3. The question this briefing exists to answer

Banks already hold transaction records. Mobile money providers already hold
transaction records. Both are already used as evidence. **So what is ClearView
adding, and is there a product in it beyond consultancy?**

## 4. What payment records actually prove, and what they do not

A bank statement or a wallet history proves one thing: **money moved.** It
cannot say what the money was for.

A lender, an investor or a funder needs four things answered. Payment records
answer part of one:

| The question | What payment data says |
|---|---|
| Is this revenue, or a transfer, a loan from family, float, or money moved between the owner's own accounts? | Cannot tell. An inflow is an inflow. |
| Is this all the revenue, or only the visible slice? | Cannot tell, and in a cash-heavy trade the invisible slice is most of it. |
| What does it cost this business to earn it? | Nothing. No cost side exists in a statement. |
| Will it continue, or is it one buyer who may leave? | Nothing, unless the counterparties happen to be identifiable. |

This is the real shape of the problem. It is not that the money is invisible.
It is that **the money is visible and meaningless**.

## 5. What ClearView adds

**The other side of the transaction.**

The business logs the sale as it happens: what product, at what price, to which
customer, through which business unit, by which staff member. That record is
made independently of the payment, on a phone, often offline, by somebody who
does not know what the payment record will say.

When the two are matched, four things follow that a payment record alone cannot
produce:

1. **Attribution.** This inflow is a sale of a specific thing, not a transfer.
2. **A completeness signal.** Declared revenue and verified revenue are held
   side by side. A cash-heavy business shows as declaring far more than is
   confirmed, which is a visible, gradeable state rather than an invisible one.
3. **Margin.** The cost side is captured in the same system, so the question
   stops being how much came in and becomes whether it was worth earning.
4. **A residue that means something.** Money that arrived with no sale to pair
   it to is counted separately. It is neither verified nor declared, and the
   size of it is itself a finding.

The honest one-line claim is therefore not "we verify revenue". It is:

> **ClearView holds the business's own record of what each payment was for, and
> grades how much of it the money confirms.**

Nobody is buying a stream of amounts. They are buying an interpretation that
can be defended.

## 6. How the evidence problem is solved today

Six mechanisms actually in use, roughly in order of how much money moves
through them:

**Nothing at all.** Most informal businesses simply cannot borrow commercially.
They use family, savings groups and moneylenders. This is the largest category.

**Collateral.** The bank ignores the business and lends against land or
property. Nothing about the trade is assessed, which is why a profitable
business with no title deed is refused and an unprofitable one with a deed is
not.

**Relationship and character lending.** A microfinance officer visits, looks at
the stock, asks the neighbours. It works and it does not scale, because the
cost of assessment is a person's day.

**Telco and wallet scoring.** The provider already sees the wallet, so
assessment costs them nothing. This is real and very large. Its limitation is
in the size and tenor of what it will lend: short, small and expensive, because
wallet flow is a weak signal of business health, exactly as section 4 sets out.

**Statement aggregation and bookkeeping applications.** Pull the statements,
categorise them, score them, lend. This is a crowded and well funded field.
Moniepoint has disbursed over 700 million dollars to small businesses, acquired
a microfinance bank in Kenya, and in December 2025 launched Moniebook, which
puts point of sale, bookkeeping, inventory and payments in one product. Oze
sells bookkeeping to businesses and lending software to banks on the same data.
Kippa raised money for exactly this and pivoted away from it.

**Distributor purchase history.** Underrated and strong: the distributor knows
precisely how much stock a retailer takes, and a retailer cannot inflate it.
Where it exists it is the best non-bank evidence available.

**In the donor world, none of the above.** Programme reporting is narrative and
self-reported against a template, in volumes that consume the reporting
organisation's staff time. Grant management software centralises documents and
compliance. It does not verify a financial claim. This is the market ClearView
is already selling into.

## 7. The strategic conclusion

The same machinery faces two markets, and they are not alike.

**Market one: evidence for lending to small businesses.** Crowded, capital
intensive, and structurally hostile to a newcomer. The winner is whoever owns
the payment rails, because for them verification costs nothing and for everyone
else it costs a commercial negotiation with a telco. Moniepoint owns the rails,
the terminal, the bank licence and now the bookkeeping. A better interpretation
layer does not beat that.

**Market two: evidence for funders of enterprise programmes.** Almost empty. A
funder with thirty grantees receives thirty narrative reports on thirty
different bases, and has no way to tell which grantee is viable. The bar being
cleared today is a document. ClearView already sells here, already has a paying
programme, and faces no incumbent doing verification at all.

**The idea of aggregating every payment channel a trader uses is a good idea
aimed at the wrong market.** Aimed at lenders it is a fight for rails that
cannot be won. Aimed at a funder's portfolio, where the alternative is a
narrative report, the same machinery has no competitor and a buyer with a
budget.

## 8. What is genuinely unknown

These cannot be answered from the platform and need testing with real buyers:

1. **Will a funder pay for verification, or does a funder prefer a report they
   can believe?** Verification makes a programme's failures visible to the
   people who funded it. That is a reason to buy and also a reason not to.
2. **Who signs: the programme, the donor behind it, or the grantee?** They have
   different budgets and different incentives, and the product is priced
   differently for each.
3. **Is the unit a programme, an organisation, or a country portfolio?**
4. **Does a verified trading record command a price at the moment a business
   borrows?** That is the only moment a small business pays for paperwork, and
   it makes the lender, not the business, the likely buyer.
5. **What is the smallest portfolio at which a benchmark is honest?** Below
   roughly five comparable organisations a published figure identifies them.

## 9. The rule that constrains every answer

The data covers real organisations and named individuals in Nigeria, Kenya and
Uganda, gathered under donor funding. Nothing identifying leaves without that
organisation's recorded consent, and any market intelligence product is built
on the anonymised path rather than on the client path with names taken off
afterwards. Those are different things and only the first is safe.
