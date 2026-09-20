# What ClearView could open up, and what it would take

An analysis of where the platform lends itself to being connected to other
systems, what stands in the way today, and what that unlocks for the business
and for the market intelligence product.

Written 20 September 2026, against the code as it stands. Every claim below
names the file or table it comes from, so it can be checked rather than
believed.

---

## 1. The short answer

**The hardest part is already done, and nobody can reach it.**

Every number ClearView produces is calculated by code that touches no database
and no network. The financial model is a single function that takes a
configuration and a set of actual figures and returns the whole model. The
portfolio analysis, the performance metrics, the investment metrics, the credit
and going-concern assessments and the readiness scoring are the same: seven
modules, nought database calls between them.

That is unusual and it is worth money. It means ClearView can be connected to
another system without rebuilding anything, because the thinking is already
separated from the plumbing.

What is missing is the doorway. Today a number can leave ClearView in one of
two forms: a page a person looks at, or a document a person downloads. There is
no way for another system to ask a question and get an answer it can use.

---

## 2. Three doors already exist, and each was built for a person

The platform is not starting from nothing. Three separate ways in and out have
already been built, each solid, each built for a human being rather than for
another system.

### The field operator door — machines already write to ClearView

`app/api/field/*` is fourteen endpoints authenticated by an opaque token held by
a field operator (`field_operator_tokens`, checked in `src/lib/field-auth.ts`
for expiry and whether the operator is still active). A phone with no signal
queues sales, and syncs them later. Every queued entry carries a `local_id`, and
a unique index makes a repeat send silently do nothing rather than book the sale
twice (`2026_07_04_field_sync_idempotency.sql`).

That is a working machine-to-machine write interface with the two properties
such an interface needs: a token that can be withdrawn, and safety against the
same message arriving twice. **It was built for one phone app. It is a general
pattern.**

### The access grant door — outsiders already read from ClearView

`client_access_grants` plus `app/api/access-grant/[token]/route.ts` lets a coach
issue a link to an investor, a programme officer or a subscriber who has no
ClearView login. The grant carries an expiry, a revocation date, a record of
when it was last used, a scope (one client, or a filtered slice of the whole
portfolio), and a one-time code emailed to the reader to prove they control the
inbox. It is rate limited.

**That is, structurally, an API key system.** Issue, scope, expire, revoke,
audit, throttle. The only thing that makes it a human feature rather than a
machine feature is what comes back: a rendered brief rather than data.

### The payment provider door — half built, and the missing half is small

`src/lib/providers/` defines one normalised shape for "money moved"
(`NormalizedProviderTxn`), with adapters for MTN Uganda and a simulated
provider, and a registry. `provider_transactions` stores the result with the
provider's own reference as the key, and a unique index so a replayed webhook
cannot create a second record of one payment. The reconciliation states, the
matching against field entries, the confidence bands and the portfolio roll-up
are all built and tested.

**There is no HTTP endpoint for a provider to post to.** The interface, the
store, the dedupe, the matching and the scoring exist; the letterbox does not.
Of everything in this document, this is the smallest piece of work with the
largest consequence, because it is what turns "the business told us" into "the
money confirms it".

---

## 3. What lends itself to an API, ranked by value over effort

### First: the financial model as a service

`runGenericModel(config, actuals)` in `src/lib/generic-engine.ts` is a pure
function. Hand it a model configuration and a set of actuals and it returns the
projection, the profit and loss by business unit, the cash position, the
depreciation and tax, the debt schedule and the scenario outcomes.

Because it touches nothing, it can be offered three ways with no change to how
it works:

1. **Run our model on your numbers.** Another system posts a configuration and
   receives the full model back. Nothing is stored. This is sellable on its own
   and carries almost no data risk, because ClearView keeps nothing.
2. **Read a client's model.** A structured version of what the dashboard shows.
3. **Write actuals into a client's model.** The path a bookkeeping system, a
   point-of-sale system or a spreadsheet would use.

The second and third are what an accounting package, a lender's system or a
programme's own reporting tool would connect to.

### Second: the payment webhook

One authenticated endpoint per provider, posting into the adapter that already
exists. Everything downstream is built. The result is verified revenue, which
is the one thing the platform can say that a questionnaire cannot.

### Third: the portfolio and market intelligence read

`src/lib/portfolio-intelligence.ts` already computes, across every financial
client: the readiness stage distribution, verified against declared revenue with
confidence bands, ranked reasons engagements fail, performance by sector, fund
absorption capacity, and an anonymised profile per organisation with a reference
code instead of a name.

This is the market intelligence product, already written. It is reachable today
only by Habib's own sign-in, or through a grant that returns a document.

### Fourth: the decision record

`gtcv_gate_signoffs`, `engagement_deliverables`, `deliverable_gate_map`,
`charter_signatures` and the evidence library hold who decided what, on what
evidence, who signed and when. A funder's own grant management system could read
this instead of waiting for a report. This is the least technically difficult
and the most commercially distinctive: it is an audit trail a donor can pull
rather than request.

### Fifth: outbound events

Nothing can subscribe to ClearView. A funder's system cannot be told that a
decision point was signed; it has to come and look. One outbound notification
would change the platform from something people visit to something that
participates in their workflow.

---

## 4. The financial model, specifically

This is where the friction is, and it is worth being precise about why.

### What makes it easy

- The engine is pure, so it can be run anywhere on anything.
- The configuration is one row per client (`generic_model_config`) holding one
  self-describing object: business units, plan lines, shared lines, settings,
  scenarios, capital structure, debts, trade credit, channels and drivers.
- Actuals are already separated from plan, already approvable, already closed
  off period by period (`generic_period_close`, `generic_year_close`).
- The calculation rules are documented in `docs/CALCULATIONS_REFERENCE.md`.

### What makes it hard, and would have to be fixed

**A business unit is not a row.** It lives inside the JSON object on
`generic_model_config`, with a made-up identifier like `shop_1`. Any system
writing in has to know the identifier without being able to look it up. This is
the single biggest source of friction for an integration and is noted as such in
the reconciliation spec. It does not need the database changed: it needs one
endpoint that lists the units and lines with their identifiers, so an outside
system can discover them rather than guess.

**A plan line is required on every transaction.** `field_transactions.plan_line_id`
cannot be empty. An outside system posting a sale must therefore already know
which line it belongs to. There is a pattern for this already
(`field_uncategorized_costs` accepts a cost with no line and holds it for a human
to place). The same holding pen should exist for anything arriving through an
API, or integrations will simply fail at the first unmapped item.

**Currency is a label, not a rate.** `generic_model_config.currency` is a string.
There is no rate table and no conversion. Any cross-country figure is therefore
either single-currency or wrong. For a market intelligence product sold across
Nigeria, Kenya and Uganda this has to be decided deliberately, not discovered
later.

**The snapshot is cached for sixty seconds in memory.** Correct for a dashboard
somebody is clicking through. Wrong as a promise to another system, which needs
to know whether it is reading live figures or a minute-old copy.

---

## 5. What is missing, in order

| # | What | Why it matters | Rough size |
|---|---|---|---|
| 1 | A key a machine can hold | Grants assume a person with an inbox. A machine needs a key with a scope, an expiry and a revocation, and no email step. The grants table is most of it already. | Small |
| 2 | A payment webhook endpoint | The last mile of an already-built chain. Turns declared revenue into verified revenue. | Small |
| 3 | Read endpoints that return data, not documents | Nothing can be integrated with today without screen scraping. | Medium |
| 4 | A discovery endpoint | Lists a client's business units, plan lines and catalogue identifiers so an outside system can map its own data to ours. Without this, every integration is a phone call. | Small |
| 5 | A holding pen for anything that arrives unmapped | Otherwise the first unrecognised item breaks the connection. The pattern already exists for costs. | Small |
| 6 | Write endpoints for actuals | The path an accounting or point-of-sale system uses. Needs 1, 4 and 5 first. | Medium |
| 7 | Outbound events | Lets a funder's system react rather than poll. | Medium |
| 8 | A written description of the interface | Without it nobody can connect without asking, which makes every integration a project. | Small |
| 9 | A decision on currency | Blocks any cross-country comparison being sold as fact. | A decision, then small |

Items 1, 2, 4, 5 and 8 together are the smallest useful thing. They would make
ClearView connectable without exposing anything new.

---

## 6. The market intelligence product

### What the platform can already say that others cannot

Most market intelligence in this sector is built on what organisations report
about themselves. ClearView holds four things that are different in kind:

**Verified revenue.** Two independent records of the same sale, from a phone and
from a payment provider, agreeing. Nobody selling survey data can say this.
`src/lib/confidence.ts` already turns it into a band rather than a claim.

**Movement, not a score.** Readiness is read three times per engagement, on the
same six fit tests and four stages. The finding is the distance travelled. A
single score from a one-off assessment cannot be compared to it.

**Why things fail, ranked.** `rankedDimensionFailures` already orders the
dimensions on which engagements fall down, across the portfolio. That is the
question a programme designer actually has.

**Real prices, twice over.** What comparable providers charge
(`gtcv_market_prices`, with the date observed so staleness shows) and what the
organisation actually charges (`gtcv_pricing_tiers`), against a cost structure
recorded in five fixed categories (`gtcv_cost_lines`) so it is comparable across
clients. Plus, for trading businesses, real selling prices per product by
category, type, size and supplier, from the catalogue dimensions on every
transaction.

Alongside those: willingness to pay by named customer segment with a named
budget holder and the willing, able, prioritised test
(`gtcv_customer_segments`), and fund absorption capacity
(`src/lib/fund-absorption-capacity.ts`).

### What would have to be built

**Almost nothing on the analysis side.** The anonymisation exists
(`anonymizedRefCode`, `buildAnonymisedProfile`), and consent to be named is
already a column on the engagement (`portfolio_consent_named`), which is the
legal spine of any data product.

What is missing is the shape of the offer:

1. **A subscription tier that is data rather than a document.** The grants
   system already has a `subscriber` grant type. Nothing behind it returns data.
2. **Time.** Every figure today is current state. A market intelligence product
   is about change, and change needs history. Nothing stores a monthly snapshot
   of the portfolio. **This is the item with a deadline attached: history not
   captured this year cannot be recovered next year.**
3. **A minimum count before a number is published.** A benchmark drawn from
   three organisations identifies all three. A rule of the form "no figure is
   shown for a group smaller than five" has to be in the code, not in a policy
   document.
4. **A decision about currency**, as above.

### The honest part

With the number of engagements running today, these benchmarks are not yet
statistically meaningful, and selling them as though they were would be found
out. The plumbing is a 2026 decision; the product is a 2027 asset. The reason to
build the plumbing now is item 2: the history only accumulates if something is
recording it, and every month that passes without it is a month that cannot be
bought back.

---

## 7. What must not be broken

The data covers real organisations and real named individuals in Nigeria, Kenya
and Uganda, gathered under donor funding. Four rules follow, and they are
constraints on the design rather than warnings to be careful:

1. **Nothing client-identifying leaves without that client's recorded consent.**
   The column exists. It must be checked in the code that serves any external
   request, not remembered by whoever issues the key.
2. **The market intelligence product is built on the anonymised path only.**
   Not on the client path with names removed afterwards. Those are different
   things and only the first is safe.
3. **A key is scoped when it is issued, never widened afterwards.** The grants
   table already works this way.
4. **Every external read is recorded.** `last_accessed_at` exists on grants.
   For machine keys this needs to be a log, not a single timestamp, because the
   question a funder will eventually ask is what was taken and when.

---

## 8. What I would do, in order

**First, decide the question this answers.** Opening a platform up is only worth
doing against a named counterparty. The two candidates the data suggests are a
funder's own reporting system reading the decision record, and an accounting or
point-of-sale system writing actuals in. They need different things, and
building for both at once builds for neither.

**Then the smallest useful thing:** a machine key, a payment webhook, a
discovery endpoint, a holding pen for unmapped items, and a written description
of the interface. That makes ClearView connectable and exposes nothing that is
not already exposed.

**Then start recording history**, monthly, whether or not anyone is buying it
yet, because that is the only item on this list that gets more expensive by
waiting.

**Then the financial model as a service**, which is the piece most likely to be
worth money on its own, and the one that carries the least risk because it can
be offered without storing anything at all.
