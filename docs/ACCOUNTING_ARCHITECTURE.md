# Clearview Actuals & Accounting Architecture

**Status: agreed design, not yet built (except where marked ✅ Built).**
**Read this before touching anything related to Actuals, P&L/BS/Cashflow, month-end close, COGS, or annual reporting.**

This document exists so these decisions survive independently of any single
conversation or session. If you are an instance of Claude picking this up
fresh, this is the source of truth — do not re-derive this design from
scratch or assume a different approach without checking with Habib first.

---

## 1. The core problem this fixes

`generic_actuals` currently has no connection to the P&L, Balance Sheet, or
Cash Flow. `runGenericModel(config)` — which drives all three — reads only
the plan (`plan_lines[].monthlyPlan`). Real data flows: Field App → sync →
`aggregate_field_transactions()` → `generic_actuals.line_values` → **nowhere**.
The Actuals tab is currently a dead end, not a pass-through.

## 2. How data is meant to flow (agreed design)

```
Field App (operator)
  -> picks a catalogue item (sale) or an existing P&L cost line (expense)
  -> operator NEVER sees price, cost, or profit figures -- volume/amount only
  -> syncs to field_transactions
  -> aggregate_field_transactions() sums by (unit, month, plan_line_id)
  -> merges into generic_actuals (see section 4 for the merge fix)

Actuals tab
  -> is a PASS-THROUGH AND INPUT layer, not a destination in itself
  -> accountant/finance assistant can ALSO manually enter figures directly
     here for stores that only record on paper -- these ADD to field-sourced
     figures for the same line, never overwrite them (section 4)
  -> aggregates by P&L line and feeds the P&L

P&L / Balance Sheet / Cash Flow
  -> HYBRID: months that have actuals show actuals; months ahead still show
     plan/forecast (confirmed choice, not actual-only)
  -> the current/open month is visually distinct ("live", still updating)
  -> at month-end close, the Finance Manager or CEO reviews and closes the
     period -- figures crystallize, the "live" highlight moves to the new
     current month
```

## 3. COGS: Standard Costing, IAS 2 / IFRS for SMEs Section 13 compliant

**Decision: standard costing, not purchase-based/periodic.** Agreed after
comparing both:

- **Standard costing (chosen):** COGS recognized at time of sale = actual
  volume sold (from field data) × a standard cost per unit, set centrally
  on the catalogue item by the CEO/Finance Manager. Never entered or seen
  by the field operator.
- **Rejected: purchase-based (what "Crop Input — Input Purchase" currently
  does today):** books the full cost when stock is bought, regardless of
  when it's sold. Distorts monthly margins when purchase and sale happen
  in different months -- fails the IAS 2 matching principle (para 34):
  cost of inventory sold must be recognized in the same period as the
  related revenue.

**Compliance condition (IAS 2 para 21-22):** standard costs are only
compliant if reviewed and revised regularly to stay close to actual cost.
This is not optional -- see section 5 for how this gets enforced, not just
requested.

**What needs building:** a cost price field on `field_catalogue`, alongside
the existing sell price. Sale sync should compute both a revenue entry AND
a cost-of-sales entry automatically (volume × cost price), with zero extra
operator input.

**Framework: IFRS for SMEs (not full IFRS).** Confirmed choice -- shapes
COGS treatment now and annual statement structure/labeling later (section 7).

## 4. Actuals data model fix — required before anything else works

**Bug found and must be fixed as part of this work:** the current
`aggregate_field_transactions()` function overwrites a plan line's value in
`generic_actuals.line_values` on every sync. If an accountant manually
enters a figure for the same line (a paper-only store), the next field
sync silently erases it.

**Required fix:** separate field-derived amounts from manually-entered
amounts into distinct storage (e.g. a new `field_line_values` jsonb column,
machine-managed only by the aggregation function, kept separate from the
existing `line_values` which the accountant edits directly). Displayed
total per line = manual + field, summed at read time. Neither writer can
ever clobber the other because they never touch the same field.

**Stock reconciliation (dependency for when stock tracking is built, not
now):** stock level must decrement by the same `quantity` field already
flowing through `field_transactions` for sales -- not a separately
maintained manual count. Noted so the eventual stock feature is built
against existing data, not a parallel one.

## 5. Month-end close, exception reporting, and the purchase-price-variance gate

**Approach: exception report reviewed by Finance Manager, not a line-by-line
approval gate.** `generic_actuals` already has `submitted`/`approved`
columns and "Draft -> Submitted" already works (✅ Built, partially --
verified directly in GenericDashboard.tsx). The `approved` half is unused;
no actual "Approve"/"Close" action exists anywhere yet.

**What closing a month means:**
1. System generates an exception report: unusual revenue/stock movements,
   AND any catalogue item whose cost price hasn't been reviewed in the
   staleness window (see below).
2. Finance Manager/CEO reviews the exceptions -- this is what actually
   guarantees the IAS 2 review requirement isn't missed, not a reminder
   email or a dashboard badge that can be ignored.
3. **Hard gate, not a soft warning:** a month cannot be closed while a
   catalogue item's cost price is stale. This was chosen deliberately over
   a dismissible warning, because a warning becomes background noise over
   time and a hard gate cannot be silently skipped.
4. Once closed: figures crystallize, "live" highlight moves to the new
   current month.

**Purchase price variance / staleness tracking:**
- `field_catalogue` needs a `cost_price_updated_at` timestamp, set
  automatically whenever the CEO/FM edits an item's cost price.
- Staleness threshold: 90 days (standard practice for input costs).
- Month-end close is blocked until every stale item is either updated or
  explicitly confirmed as still accurate.
- Future refinement, not part of the first build: track the actual
  variance between standard cost and real purchase price when it diverges,
  so drift is visible rather than silently absorbed (standard IAS 2
  practice, but genuinely a "later" item -- don't build it now).

## 6. Annual figures and year-end close

**Currently: nowhere. No fiscal year concept exists anywhere in the schema.**

Required, once the monthly pieces above exist:

1. **Annual Actuals as its own report** -- Annual P&L, year-end Balance
   Sheet position, full-year Cash Flow Statement, generated automatically
   the moment month 12 of a fiscal year closes. Not a manual sum of 12 rows.
2. **Year-End Close, distinct from and bigger than a Month-End Close:**
   - Figures lock as final -- no edits without a formal reopening action.
   - Closing Balance Sheet figures (cash, receivables, payables, retained
     earnings) become Year 2's **opening balances automatically** -- this
     carry-forward must not be a manual re-typing step.
   - The closed year stays fully available for comparison (Year 1 Actual
     vs Year 2 Actual vs Year 2 Plan side by side) but structurally
     separated from the year in progress -- not a flat undifferentiated
     list of 24+ months.
3. **Investor/grant document generator needs an "Actual Performance" mode.**
   The existing generator (`app/api/investment-pitch/route.ts` and the
   CONAS equivalent) is currently built entirely from the plan/projections.
   Once real annual actuals exist, funders should be shown genuine
   historical results alongside or instead of projections -- a materially
   stronger case for DFI/grant applications.

## 7. Accounting framework: IFRS for SMEs

Confirmed choice over full IFRS -- appropriate for businesses at this
scale. Governs: the COGS/standard-costing treatment above, and will govern
how the eventual annual P&L/BS/Cashflow are labeled and structured. Revisit
this section if that structure is designed before this note is updated.

---

## Build order (agreed, not yet started as of this document's creation)

1. Fix the `generic_actuals` merge bug (section 4) -- prerequisite for
   everything else, since nothing above works safely until field and
   manual entries can coexist.
2. Reconnect the P&L (and then BS, Cash Flow) to `generic_actuals`, hybrid
   mode: closed/past months show actuals, months ahead show plan.
3. Standard costing for COGS (section 3): cost price on `field_catalogue`,
   automatic COGS entry on sale sync.
4. Month-end close workflow + exception report + the 90-day cost-review
   hard gate (section 5).
5. Annual figures and year-end close (section 6) -- deliberately last;
   depends on everything above existing and working first.

**When any of the above changes -- a decision gets refined, reversed, or
extended -- update this document in the same PR as the code change.** This
file is the record, not the conversation it came from.
