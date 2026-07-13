# ClearView Calculations Reference

Complete reference for every metric, score, and computed value in the ClearView generic financial model system, as actually implemented in the codebase. Written for use as the source material for a formal calculations specification.

**Scope.** This covers the ClearView "generic model" product: `src/lib/generic-engine.ts`, `src/lib/scoring-engine.ts`, `src/lib/liquidity-readiness.ts`, `src/lib/confidence.ts`, `src/lib/reconciliation-engine.ts`, `src/lib/verification-display.ts`, `src/lib/investment-metrics.ts`, `src/lib/month-end-close.ts`, `src/lib/annual-close.ts`, `src/lib/actuals.ts`, `src/lib/field-cogs.ts`, and the ratio calculations embedded directly in `src/components/generic/GenericDashboard.tsx`'s Clearview Intelligence tab. **Explicitly out of scope**: `src/lib/conas-engine.ts`, `src/lib/canvas-types.ts`, `src/lib/analytics-engine.ts` (CONAS is a separate, older, architecturally distinct engine serving a different dashboard route, `/dashboard/conas`) and `src/lib/coach-business-metrics.ts` (the coach's own commercial/pipeline metrics, not client financial scoring). Say the word if either should be added as a follow-up.

**Conventions used throughout.** All monetary figures are in the client's configured currency (`config.currency`, e.g. UGX/KES/NGN/GHS/USD/GBP), no minor units. All arrays are indexed by month, 0-based, aligned to `config.start_date`. "The engine" means `runGenericModel()` in `generic-engine.ts`, the single entry point that produces every P&L/Cash Flow/Balance Sheet figure. Code quoted verbatim is marked with `code font`; where TypeScript ternaries are quoted directly they are the literal implementation, not a paraphrase.

---

## Summary Table

| # | Metric | Status | Section |
|---|--------|--------|---------|
| 1 | Revenue Recognition (Standard / Spread / Service-Fee lines) | Fully built | [§1](#1-revenue-recognition) |
| 2 | Cost of Sales (COGS) | Fully built | [§2](#2-cost-of-sales-cogs) |
| 3 | Gross Profit | Fully built | [§3](#3-gross-profit) |
| 4 | Shared Cost Allocation | Fully built | [§4](#4-shared-cost-allocation) |
| 5 | Total Operating Costs | Fully built | [§5](#5-total-operating-costs) |
| 6 | EBITDA | Fully built | [§6](#6-ebitda) |
| 7 | Depreciation | Fully built | [§7](#7-depreciation) |
| 8 | EBIT | Fully built | [§8](#8-ebit) |
| 9 | Interest Expense | Fully built | [§9](#9-interest-expense) |
| 10 | Net Profit Before Tax (NBT) | Fully built | [§10](#10-net-profit-before-tax-nbt) |
| 11 | Corporate Tax | Fully built | [§11](#11-corporate-tax) |
| 12 | Net Profit After Tax (NPAT) / Hybrid NPAT | Fully built | [§12](#12-net-profit-after-tax-npat--hybrid-npat) |
| 13 | Spread Analysis (per-unit margin) | Fully built | [§13](#13-spread-analysis) |
| 14 | Service Margins (per-engagement) | Fully built | [§14](#14-service-margins) |
| 15 | Break-Even Revenue | Fully built | [§15](#15-break-even-revenue) |
| 16 | Staff Efficiency (Revenue/Head, Staff Cost %) | Fully built | [§16](#16-staff-efficiency) |
| 17 | Debt Schedule (Interest / Principal / Outstanding / Total Repayment) | Fully built | [§17](#17-debt-schedule) |
| 18 | Trade Credit (DPO / DSO / Cash Conversion Gap / Outstanding balances) | Fully built | [§18](#18-trade-credit) |
| 19 | Cash Flow Statement (Operating / Financing / Investing / Net / Open / Close) | Fully built | [§19](#19-cash-flow-statement) |
| 20 | Cash Warning Months | Fully built | [§20](#20-cash-warning-months) |
| 21 | Balance Sheet + Accounting Identity Check | Fully built | [§21](#21-balance-sheet) |
| 22 | Whole-Business Break-Even | Fully built | [§22](#22-whole-business-break-even) |
| 23 | Scenario / Stress Test Multipliers | Fully built | [§23](#23-scenario--stress-test-multipliers) |
| 24 | Credit Risk Score | Fully built | [§24](#24-credit-risk-score) |
| 25 | DSCR (Debt Service Coverage Ratio) | Fully built | [§25](#25-dscr-debt-service-coverage-ratio) |
| 26 | Going Concern Score | Fully built | [§26](#26-going-concern-score) |
| 27 | Investment Readiness Score | Fully built | [§27](#27-investment-readiness-score) |
| 28 | Liquidity Readiness Score (LRS) | Fully built | [§28](#28-liquidity-readiness-score-lrs) |
| 29 | Bank Fit / Investor Fit Scores | Fully built | [§29](#29-bank-fit--investor-fit-scores) |
| 30 | Viability Rating | Fully built | [§30](#30-viability-rating) |
| 31 | Net Present Value (NPV) | Fully built | [§31](#31-net-present-value-npv) |
| 32 | Internal Rate of Return (IRR) | Fully built | [§32](#32-internal-rate-of-return-irr) |
| 33 | Payback Period | Fully built | [§33](#33-payback-period) |
| 34 | Revenue CAGR | Fully built | [§34](#34-revenue-cagr) |
| 35 | Return on Capital Employed (ROCE) | Fully built | [§35](#35-return-on-capital-employed-roce) |
| 36 | Debt / EBITDA | Fully built | [§36](#36-debt--ebitda) |
| 37 | Gearing (Debt / Equity) | Fully built | [§37](#37-gearing-debt--equity) |
| 38 | Interest Cover | Fully built | [§38](#38-interest-cover) |
| 39 | Cash Runway | Fully built | [§39](#39-cash-runway) |
| 40 | Current Ratio / Quick Ratio | Fully built | [§40](#40-current-ratio--quick-ratio) |
| 41 | Customer Growth / Blended CAC | Fully built | [§41](#41-customer-growth--blended-cac) |
| 42 | Reconciliation Match Result | Fully built | [§42](#42-reconciliation-match-result) |
| 43 | Verified Value Share | Fully built | [§43](#43-verified-value-share) |
| 44 | Verification Confidence Score & Label | Fully built | [§44](#44-verification-confidence-score--label) |
| 45 | Recognition Badges | Fully built | [§45](#45-recognition-badges) |
| 46 | Wallet-Link Readiness Status | Partially built | [§46](#46-wallet-link-readiness-status) |
| 47 | Month-End Exception Report | Fully built | [§47](#47-month-end-exception-report) |
| 48 | Period Close Eligibility | Fully built | [§48](#48-period-close-eligibility) |
| 49 | Annual P&L / Annual Cash Flow / Year-End Balance Sheet | Fully built | [§49](#49-annual-pl--annual-cash-flow--year-end-balance-sheet) |
| 50 | Calendar-Year Close Eligibility | Fully built | [§50](#50-calendar-year-close-eligibility) |
| 51 | Automatic COGS from Catalogue Sale (Clearview Field) | Fully built | [§51](#51-automatic-cogs-from-catalogue-sale-clearview-field) |
| 52 | Fund Absorption Capacity | **Not built** | [§52](#52-not-built-fund-absorption-capacity) |
| 53 | Seasonal Cash Position Projection | **Not built** (distinct from seasonal *debt repayment*, §17) | [§53](#53-not-built-seasonal-cash-position-projection) |

---

## 1. Revenue Recognition

**Purpose.** Converts each business unit's configured plan lines into a monthly revenue figure, using one of three recognition models depending on how that line of business actually sells.

**Location.** `runGenericModel() → calcUnit()`, `generic-engine.ts:512-559`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `l.line_type` | `'standard' \| 'spread' \| 'service_fee'` | User-entered (Settings → Business Units) | enum |
| `l.monthly_plan` | `number[]` | User-entered | currency, one value per month |
| `l.buy_price`, `l.sell_price`, `l.volume` | `number[]` (spread lines only) | User-entered | currency / currency / units |
| `l.fee_per_engagement`, `l.cost_per_engagement`, `l.engagements` | `number[]` (service-fee lines only) | User-entered | currency / currency / count |
| `rev_mult` | `number` | Derived — active scenario's revenue multiplier (§23) | ratio |
| `l.category` | `'revenue' \| 'cost_of_sales' \| 'staff' \| 'direct_opex' \| 'shared'` | User-entered | enum |

**Formula.**

- **Standard line** (`line_type === 'standard'`): `plan = l.monthly_plan` verbatim, no transformation.
- **Spread line** (`line_type === 'spread'`): for each month `m`,
  `plan[m] = l.sell_price[m] * l.volume[m]`
  This is the **gross sale value**, not net margin — the buy cost is booked separately to Cost of Sales (§2), never netted against revenue. Rationale in code: these businesses buy and resell as principals bearing inventory/price risk, so gross revenue recognition applies (matches IFRS 15 principal-vs-agent treatment).
- **Service-fee line** (`line_type === 'service_fee'`): for each month `m`,
  `plan[m] = l.fee_per_engagement[m] * l.engagements[m]`
- **Final revenue posting**, every line type, every month `m`:
  `rev[m] += plan[m] * rev_mult` — but only if `l.category === 'revenue'`.

**Output.** `rev: number[]`, one non-negative-in-practice (not enforced) currency value per month, per unit. Displayed on the P&L Statement as the "Revenue" row (bold), and summed into `metrics.total_revenue`.

**Edge cases.**
- Missing `buy_price`/`sell_price`/`volume` on a nominally-spread line (`l.buy_price && l.sell_price && l.volume` all falsy-checked): the spread transformation is skipped entirely; `plan` falls back to `l.monthly_plan` (typically all-zero for a spread line, since spread lines are created via `spreadLine()` with `monthly_plan: Array(months).fill(0)`).
- `l.active === false`: the line is excluded entirely — filtered out at `lines = config.plan_lines.filter(l => l.unit_id === unit.id && l.active)`.
- Zero volume/engagements: revenue for that month is `0` for that line, not `null` — no special-cased zero handling.
- Negative `sell_price` or `volume`: not validated or clamped anywhere; would produce negative revenue, silently.

**Dependencies.** Feeds Gross Profit (§3), Shared Cost Allocation (§4, via unit revenue share), EBITDA (§6), Break-Even (§15, §22), Trade Credit DSO (§18), every downstream score.

**Known limitations / assumptions.** No revenue recognition timing distinction (accrual vs. cash) beyond what Trade Credit (§18) separately models; a sale is recognized in full in the month it's planned/entered, regardless of when cash is actually collected.

---

## 2. Cost of Sales (COGS)

**Purpose.** The direct, variable cost attributable to a unit's revenue.

**Location.** `generic-engine.ts:534-541, 551-558`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `l.buy_price`, `l.volume` (spread lines) | `number[]` | User-entered | currency / units |
| `l.cost_per_engagement`, `l.engagements` (service-fee lines) | `number[]` | User-entered | currency / count |
| `l.monthly_plan` (standard `cost_of_sales`-category lines) | `number[]` | User-entered | currency |
| `cost_mult` | `number` | Derived — active scenario's cost multiplier (§23) | ratio |

**Formula.**

- **Spread line**: `buy_cost[m] = l.buy_price[m] * l.volume[m]`, then `cogs[m] += buy_cost[m] * cost_mult`.
- **Service-fee line**: `cost_plan[m] = l.cost_per_engagement[m] * l.engagements[m]`, then `cogs[m] += cost_plan[m] * cost_mult`.
- **Standard line** with `category === 'cost_of_sales'`: `cogs[m] += l.monthly_plan[m] * cost_mult`.

**Output.** `cogs: number[]`, currency per month, per unit. Displayed as "Cost of Sales" row (negated for display).

**Edge cases.** Same as §1 — inactive lines excluded, missing spread/service-fee sub-fields fall back to `monthly_plan` (typically zero).

**Dependencies.** Feeds Gross Profit (§3); consumed as the DPO denominator in Trade Credit (§18).

**Known limitations.** No inventory/stock valuation on the Balance Sheet — COGS is expensed as incurred with no separate stock asset tracked in the generic model (Clearview Field has its own `field-stock.ts`, out of this document's scope).

---

## 3. Gross Profit

**Purpose.** Revenue less the direct cost of generating it — the margin before any staff, overhead, or shared cost is considered.

**Location.** `generic-engine.ts:580` (per unit), `:660` (parent/sub-unit consolidation), `:776` (whole-business).

**Formula.** `gp[m] = rev[m] - cogs[m]`, per month, per unit. Identical formula at the parent-consolidation level (`c.gp = c.rev.map((r,m) => r - c.cogs[m])`) and at the whole-business consolidated level (`con.gp[m] += r.gp[m]` summed across every top-level/parent unit in `consolidatedIds`).

**Input variables.** `rev[m]`, `cogs[m]` — both derived (§1, §2).

**Output.** `gp: number[]`, currency, can be negative. Displayed bold + highlighted on the P&L.

**Edge cases.** None beyond upstream — a straight subtraction, no branching.

**Dependencies.** Feeds EBITDA (§6), Break-Even (§15/§22), Gross Margin (used in `metrics.gross_margin`, LRS Market Opportunity/Profitability dimensions §28).

**Known limitations.** None beyond §1/§2's.

---

## 4. Shared Cost Allocation

**Purpose.** Splits whole-business overhead costs (rent, management, shared admin — costs that don't belong to one specific unit) across units in proportion to each unit's headcount and revenue contribution, so per-unit EBITDA reflects a fair share of the business's fixed costs.

**Location.** `generic-engine.ts:684-711`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `config.shared_lines[].monthly_plan` | `number[]` | User-entered | currency |
| `u.headcount` | `number` | User-entered (per business unit) | count |
| `settings.shared_cost_fixed_pct` | `number` (default `0.5`) | User-entered (Settings → General) | ratio, 0–1 |
| `rev[m]` per unit | `number[]` | Derived (§1) | currency |
| `cost_mult` | `number` | Derived (§23) | ratio |

**Formula.**

1. `sharedPool[m] = Σ over shared_lines of (l.monthly_plan[m] * cost_mult)`
2. `totalHC = Σ over allocUnits of u.headcount`, floored at `1` if zero (`|| 1`) to avoid division by zero.
3. `fixedPct = settings.shared_cost_fixed_pct ?? 0.5`
4. For each top-level unit `u`, each month `m`:
   `hcShare = u.headcount / totalHC`
   `totalRev[m] = Σ over allocUnits of unitPL[u.id].rev[m]`
   `revShare = totalRev[m] > 0 ? unitPL[u.id].rev[m] / totalRev[m] : 0`
   `unitPL[u.id].shared[m] = sharedPool[m] * (fixedPct * hcShare + (1 - fixedPct) * revShare)`
5. **Sub-unit distribution** (for units with a `parent_id`): the parent's own `shared[m]` (from step 4) is redistributed to its sub-units by REVENUE SHARE ONLY, not headcount:
   `subs[su].shared[m] = parentRev[m] > 0 ? parentShared[m] * (su.rev[m] / parentRev[m]) : parentShared[m] / subs.length`

**Output.** `shared: number[]` per unit, currency per month. Displayed as "Shared Costs" row in per-unit P&L views.

**Edge cases.**
- `settings.shared_cost_fixed_pct === 0`: entire pool allocated purely by revenue share. Explicitly regression-tested (`generic-engine.test.ts:143-149`, guards against a falsy-zero `||` bug that would have silently defaulted this to `0.5`).
- `totalHC === 0` (no unit has any headcount): floored to `1`, so `hcShare = 0/1 = 0` for every unit — the fixed-pct portion of the pool effectively goes unallocated by headcount, only the revenue-share portion lands.
- `totalRev[m] === 0`: `revShare = 0` for every unit that month — the revenue-share portion of the pool is unallocated.
- Sub-unit with `parentRev[m] === 0`: falls back to an equal split across all sub-units (`parentShared / subs.length`), not zero.

**Dependencies.** Feeds Total Operating Costs (§5) and EBITDA (§6) at the unit level. **Does not affect** consolidated EBITDA (§6) — allocation only moves cost between units, never changes the whole-business total (documented explicitly in `SettingsTab`'s UI copy: "Splitting only moves cost between units, so it never changes your total profit, cash, or balance sheet").

**Known limitations.** The fixed-vs-revenue split (`fixedPct`) is one single global ratio applied to the whole shared pool — there's no per-shared-line allocation basis (e.g. "allocate rent by floor space, allocate management salary by headcount"); every shared line is pooled together before the single split rule is applied.

---

## 5. Total Operating Costs

**Purpose.** All operating costs at the unit level, feeding EBITDA.

**Location.** `generic-engine.ts:719`.

**Formula.** `r.total_opex[m] = r.staff[m] + r.opex[m] + r.shared[m]`, where `staff[m]` is the sum of every `category === 'staff'` line, `opex[m]` is the sum of every `category === 'direct_opex'` line (both accumulated identically to COGS in §2's step, via `plan.forEach` in `calcUnit`), and `shared[m]` is from §4.

**Output.** `total_opex: number[]`, currency per month, per unit. Displayed as "Total Operating Costs" on the consolidated P&L.

**Dependencies.** Feeds EBITDA (§6).

---

## 6. EBITDA

**Purpose.** Earnings before interest, tax, depreciation, and amortisation — operating profitability independent of financing structure and capital investment timing.

**Location.** `generic-engine.ts:720` (per unit), `:778` (consolidated).

**Formula.** `r.ebitda[m] = r.gp[m] - r.total_opex[m]`, per unit. Consolidated: `con.ebitda[m] = Σ over consolidatedIds of unitPL[uid].ebitda[m]`.

**Output.** `ebitda: number[]`, currency, can be negative. `metrics.total_ebitda = Σ over all months of con.ebitda[m]`. Displayed bold + highlighted on P&L.

**Edge cases.** None beyond upstream (§3, §5) — straight subtraction/sum.

**Dependencies.** This is the single most-depended-on figure in the system — feeds Depreciation/EBIT (§7–8), every scoring metric (Credit Risk §24, Going Concern §26, Investment Readiness §27, LRS Profitability/Market-Opportunity §28), DSCR's numerator (§25), Debt/EBITDA (§36), ROCE's numerator (via EBIT, §35), `metrics.total_ebitda`, `metrics.net_margin`.

**Known limitations.** None — this is a standard, unambiguous EBITDA calculation.

---

## 7. Depreciation

**Purpose.** Straight-line depreciation of fixed assets, recognized as a real P&L expense (previously entirely absent from the model — see Known Limitations).

**Location.** `generic-engine.ts` — `buildDepreciationSchedule()` (exported pure function), wired in at `:842-844`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `cap.fixed_assets` | `number` | User-entered (Settings → Capital Structure) | currency |
| `cap.fixed_asset_useful_life_years` | `number`, default `5` | User-entered (Settings → Capital Structure) | years |
| `months` | `number` | Derived (`config.planning_months`) | count |

**Formula.**

1. `usefulLifeMonths = (cap.fixed_asset_useful_life_years ?? 5) * 12`
2. `perMonth = cost / usefulLifeMonths` (straight-line rate)
3. For each month `m` from `0` to `months-1`, sequentially, tracking `accumulated` (starts at `0`):
   `charge = min(perMonth, max(0, cost - accumulated))`
   `monthlyDepreciation[m] = charge`
   `accumulated += charge`
   `netBookValue[m] = cost - accumulated`

The asset is treated as placed in service in month 1 (index 0) — the same month its cash outflow is booked to Investing Cash Flow (§19).

**Output.** `con.depreciation: number[]`, currency per month, non-negative. Displayed as "Depreciation" row on the Consolidated P&L (between EBITDA and EBIT), negated for display.

**Edge cases.**
- `cost <= 0` or `usefulLifeMonths <= 0`: `monthlyDepreciation` stays all-zero; `netBookValue` stays flat at `max(0, cost)` for every month (i.e., an unset useful life means "not depreciated," not a divide-by-zero crash or an instant full write-off).
- Asset fully depreciated before the plan ends: `charge` floors at `max(0, cost - accumulated)`, so `monthlyDepreciation` correctly drops to `0` once `accumulated === cost`, and `netBookValue` floors at exactly `0`, never negative.

**Dependencies.** Feeds EBIT (§8), and is added back (not deducted) in Operating Cash Flow (§19) since it's non-cash. Feeds the Balance Sheet's Fixed Assets line directly (`bs.fixed_assets = depreciation.netBookValue`, §21).

**Known limitations.** Straight-line only — no declining-balance or units-of-production method. Single lump-sum asset (one cost, one useful life) per client; no per-asset register supporting multiple assets purchased at different times with different lives. `con.ebitda` (§6) and DSCR's/Credit-Risk's EBITDA inputs are deliberately **unaffected** by depreciation (EBITDA is pre-depreciation by definition) — only EBIT (§8), NBT (§10), Tax (§11), NPAT (§12), and the Balance Sheet (§21) see it.

---

## 8. EBIT

**Purpose.** Operating profit after depreciation, before interest and tax — the standard input for Interest Cover and ROCE.

**Location.** `generic-engine.ts:910`.

**Formula.** `con.ebit[m] = con.ebitda[m] - con.depreciation[m]`

**Output.** `con.ebit: number[]`, currency. Displayed as "EBIT" row on the Consolidated P&L, bold.

**Edge cases.** With no fixed assets configured, `con.depreciation[m] === 0` for every month, so `con.ebit[m] === con.ebitda[m]` exactly — regression-tested (`generic-engine.test.ts`, "REG: depreciation reduces EBIT below EBITDA...").

**Dependencies.** Feeds NBT (§10), and — via `annualEbit` in `GenericDashboard.tsx:3837` — ROCE (§35) and Interest Cover (§38). Debt/EBITDA (§36) deliberately uses EBITDA (§6), not EBIT, per convention.

---

## 9. Interest Expense

**Purpose.** The tax-deductible finance cost of outstanding debt for the month.

**Location.** `generic-engine.ts:763` (`con.interest = debtSchedule.totalInterest`) — computed by the Debt Schedule (§17); see that section for the underlying formula.

**Output.** `con.interest: number[]`, currency, non-negative. Displayed as "Interest" row on the Consolidated P&L only (not per-unit — interest is a whole-business figure, not allocated to a unit; the UI shows a banner directing users to the Consolidated view when viewing a per-unit P&L and a loan/depreciation exists).

**Dependencies.** Deducted in NBT (§10). Not itself a plan-vs-actual figure — it's computed from the loan's real terms regardless of which month is "closed," so the same `con.interest[m]` value is used for both the pure-plan and actual/hybrid NBT tracks.

---

## 10. Net Profit Before Tax (NBT)

**Purpose.** Taxable profit before the corporate tax charge.

**Location.** `generic-engine.ts:911` (planned track); `:931-932` (actual-derived track, `actNbtRaw`).

**Formula.** `con.nbt[m] = con.ebit[m] - con.interest[m]`

Actual/hybrid track: `actNbtRaw[m] = (con.act_ebitda[m] - con.depreciation[m]) - con.interest[m]`, computed only for months where `con.act_ebitda[m] !== null` (i.e., past/current months — see §12 for the calendar rule).

**Output.** `con.nbt: number[]`, currency, can be negative.

**Dependencies.** Feeds Corporate Tax (§11).

**Known limitations.** Principal repayment is deliberately **excluded** — repaying loan principal is a financing cash outflow, not a P&L expense (explicitly commented and regression-tested: "REG: loan principal repayment reduces financing cash flow but not npat").

---

## 11. Corporate Tax

**Purpose.** The tax charge on taxable profit, assessed on **cumulative annual profit within each fiscal year** (not independently per month), with an unused-loss carryforward into future years — matching how corporate tax is actually filed.

**Location.** `generic-engine.ts` — `applyCorporateTax()` (exported pure function), wired at `:951-965`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `nbt` | `number[]` | Derived (§10) | currency |
| `yearGroups` | `YearGroup[]` | Derived — calendar-year groupings of month indices, from `buildYearGroups(config.start_date, months)` | — |
| `taxRate` (`settings.corporate_tax_rate`) | `number`, default `0.30` | User-entered (Settings → General) | ratio |
| `openingNol` | `number`, default `0` | Derived — carried from the prior fiscal year within the same run | currency |

**Formula.** For each fiscal year `g` in order, maintaining a running `nol` (net operating loss carryforward, starts at `max(0, openingNol)`):

1. `cumNbt = 0`, `cumTax = 0` (reset each year)
2. For each month `m` in `g.monthIndices`, in order:
   `cumNbt += nbt[m]`
   `taxableCum = max(0, cumNbt - nol)`
   `newCumTax = taxableCum * taxRate`
   `tax[m] = newCumTax - cumTax` ← **this month's tax is the CHANGE in cumulative liability**, which can be negative (a loss month reducing a tax provision already recognized earlier in the same year — a real, standard interim-provisioning effect, not a bug)
   `cumTax = newCumTax`
   `npat[m] = nbt[m] - tax[m]`
3. At year-end: `nol = cumNbt > 0 ? max(0, nol - cumNbt) : nol + (-cumNbt)` — a profitable year consumes carryforward first; a loss year adds to it. **Uncapped**: no expiry period on the carryforward.

This is run **twice**, independently:
- On the pure-plan `con.nbt` stream → produces `con.tax` / `con.npat` (the "what the plan alone would owe" reference track, unaffected by actuals).
- On a **hybrid** stream (`hybridNbtForTax[m] = actNbtRaw[m] ?? con.nbt[m]` — actual where available, plan for the rest of that fiscal year) → produces `con.hybrid_tax` / `con.hybrid_npat`, the canonical figures Cash Flow and the Balance Sheet consume, and (for past/current months only) `con.act_tax` / `con.act_npat`.

**Output.** `tax: number[]`, currency, can legitimately be negative mid-year. Displayed as "Tax" row, negated for display.

**Edge cases.**
- `taxRate === 0`: `tax` is `0` for every month — regression-tested against a falsy-zero `||` bug (`generic-engine.test.ts:135-141`).
- A loss month immediately after a profit month in the same year: tax for that month is negative (a partial credit against the earlier provision), never floored at zero mid-year — only the **cumulative** `taxableCum` is floored at zero (`max(0, cumNbt - nol)`), not the per-month delta.
- A fiscal year that starts or ends mid-plan (partial calendar year, e.g. a client starting in April): still processed as its own `yearGroups` entry with however many months it actually contains; carryforward still applies from it into the next year.
- Steady, flat, always-positive NBT: the cumulative method produces byte-for-byte the same per-month tax as a naive independent-per-month calculation would — proven by the fact all 487 pre-existing regression tests (written against the old per-month formula) pass unchanged against this new implementation.

**Dependencies.** Feeds NPAT (§12), and via `con.hybrid_npat`, Cash Flow (§19) and the Balance Sheet's Retained Earnings (§21).

**Known limitations / assumptions.** Loss carryforward is uncapped in both duration and value — many real tax regimes cap either or both (e.g. a 5-year expiry). Not modelled. No distinction between different tax treatments by income type (e.g. capital gains).

---

## 12. Net Profit After Tax (NPAT) / Hybrid NPAT

**Purpose.** Bottom-line profit; the figure Cash Flow and the Balance Sheet are built from.

**Location.** `generic-engine.ts` — three parallel tracks, all populated by §11's `applyCorporateTax()`:

- `con.npat` — pure-plan track: `nbt[m] - tax[m]`, computed from `con.nbt` alone, unaffected by any actual data entered.
- `con.act_npat` — actual-only track, **nullable**, non-null only for past/current months (the "calendar rule": `isPastOrCurrentMonth[m] = m <= todayMonthIndex`, computed once from `config.start_date` vs. today's real date).
- `con.hybrid_npat` — **the canonical figure**: actual where available (past/current months), plan-informed-by-actuals for the rest of that same fiscal year (future months within a year that already has real results reflect the real year-to-date tax position, not a naive "as if nothing happened" plan figure).

**Formula.** See §11 — NPAT is simply `nbt[m] - tax[m]` on whichever NBT stream is being evaluated.

**Output.** `con.npat`, `con.act_npat`, `con.hybrid_npat`: `number[]`, currency, can be negative. `metrics.total_npat = Σ con.npat`. `metrics.net_margin = total_npat / total_revenue` (or `0` if no revenue).

**Edge cases.** `con.act_npat[m]` is `null` for every future month by construction — displayed as "use the plan" at the UI layer (`applyPeriodActual`, `actuals.ts:74-76`).

**Dependencies.** `con.hybrid_npat` directly drives Operating Cash Flow (§19, with depreciation added back) and cumulative Retained Earnings on the Balance Sheet (§21).

**Known limitations.** See §11's — the same tax-carryforward assumptions apply here since NPAT is downstream of tax.

---

## 13. Spread Analysis

**Purpose.** Per-transaction margin detail for "buy low, sell high" (spread) revenue lines — crop input resale, livestock trading, etc.

**Location.** `generic-engine.ts:524-536`.

**Input variables.** `l.buy_price[]`, `l.sell_price[]`, `l.volume[]` — all user-entered, currency/currency/units.

**Formula.**

- `spread_per_unit[m] = l.sell_price[m] - l.buy_price[m]`
- `total_spread[m] = spread_per_unit[m] * l.volume[m]`
- `spread_margin_pct[m] = l.sell_price[m] > 0 ? spread_per_unit[m] / l.sell_price[m] : 0`

**Output.** An array of `{line_id, name, buy_price, sell_price, volume, spread_per_unit, total_spread, spread_margin_pct}` per spread line. Displayed on the per-unit "Spread Analysis" section of the P&L tab.

**Edge cases.** `sell_price[m] === 0`: `spread_margin_pct[m] = 0` (avoids divide-by-zero).

**Dependencies.** Informational only — does not feed back into any other score; it's a decomposition view of figures already counted in Revenue (§1) and COGS (§2).

---

## 14. Service Margins

**Purpose.** Per-engagement margin detail for fee-for-service revenue lines (consulting, advisory, etc.).

**Location.** `generic-engine.ts:538-549`.

**Formula.**

- `margin[m] = (l.fee_per_engagement[m] - l.cost_per_engagement[m]) * l.engagements[m]`
- `margin_pct[m] = l.fee_per_engagement[m] > 0 ? (l.fee_per_engagement[m] - l.cost_per_engagement[m]) / l.fee_per_engagement[m] : 0`

**Output.** An array of `{line_id, name, fee, cost, margin, margin_pct, engagements}` per service-fee line.

**Edge cases.** `fee_per_engagement[m] === 0`: `margin_pct[m] = 0`.

**Dependencies.** Informational only, same as §13.

---

## 15. Break-Even Revenue

**Purpose.** Per-revenue-line break-even: how much revenue that specific line needs to cover its allocated share of fixed costs plus its own variable (COGS) cost rate.

**Location.** `generic-engine.ts:590-611`.

**Input variables.** `staff[]`, `opex[]` (unit-level, annualized via `yr()`), `cogs[]`, `rev[]` (per line, annualized), `rev_mult`.

**Formula.**

1. `total_fixed = annual(staff) + annual(opex)` (unit-level; excludes shared costs, see Known Limitations)
2. For each revenue line `l` (excluding any line whose name starts with `"Add "`):
   `line_rev = ` (for spread lines) `Σ_m sell_price[m] * volume[m] * rev_mult`, else `annual(monthly_plan) * rev_mult`
   `line_share = total unit rev > 0 ? line_rev / total_unit_rev : 1 / count(revenue lines)`
   `allocated_fixed = total_fixed * line_share`
   `cogs_pct = line_rev > 0 ? (annual(cogs) * line_share) / line_rev : 0`
   `breakeven_revenue = cogs_pct < 1 ? allocated_fixed / (1 - cogs_pct) : 0`
   `gap = line_rev - breakeven_revenue`

**Output.** An array of `{line_id, name, monthly_fixed_cost, variable_cost_pct, breakeven_revenue, current_revenue, gap}` per revenue line.

**Edge cases.**
- No revenue lines: `line_share` falls back to `1 / max(1, rev_lines.length)`, an equal split.
- `cogs_pct >= 1` (variable cost consumes 100%+ of revenue): `breakeven_revenue = 0` (mathematically, break-even would be infinite; the code returns `0` rather than `Infinity` or `NaN`).

**Dependencies.** Independent of other scores; a diagnostic view.

**Known limitations.** Allocates the unit's own `staff + opex`, not its share of the whole-business shared pool (§4) — shared costs are excluded from this specific break-even calculation.

---

## 16. Staff Efficiency

**Purpose.** Revenue generated per staff member, and staff cost as a share of revenue.

**Location.** `generic-engine.ts:625-629` (per unit).

**Formula.**
- `revenue_per_head = u.headcount > 0 ? ann_rev / u.headcount : 0`
- `staff_cost_pct = ann_rev > 0 ? ann_staff / ann_rev : 0`

Whole-business equivalents, in `metrics` (`generic-engine.ts:1083-1088`):
- `metrics.revenue_per_head = total_headcount > 0 ? total_revenue / total_headcount : 0`
- `metrics.staff_cost_pct = total_revenue > 0 ? total_staff_cost / total_revenue : 0`, where `total_headcount = Σ activeUnits.headcount` and `total_staff_cost = Σ allocUnits.ann_staff`.

**Output.** Currency-per-head and a ratio (0–1, displayed as %).

**Dependencies.** `revenue_per_head` feeds LRS Capacity dimension (§28) directly (as `staffCapability`).

---

## 17. Debt Schedule

**Purpose.** Month-by-month amortization of every configured debt obligation — interest, principal, outstanding balance.

**Location.** `scoring-engine.ts:248-314`, function `buildDebtSchedule()`.

**Input variables.**

| Variable | Type | Source | Unit |
|---|---|---|---|
| `ob.drawdownMonth` | `number`, default `1` | User-entered (Settings → Debt Obligations, or Capital Structure → Bank Loan) | month index (1-based) |
| `ob.annualRate` | `number` | User-entered | ratio |
| `ob.tenorMonths` | `number`, default `12` | User-entered | months |
| `ob.gracePeriodMonths` | `number`, default `0` | User-entered | months |
| `ob.principal` | `number` | User-entered | currency |
| `ob.repaymentType` | `'amortising' \| 'bullet' \| 'quarterly' \| 'seasonal'`, default `'monthly'`→treated as amortising | User-entered | enum |
| `ob.seasonalMonths` | `number[]` (seasonal only) | User-entered | month indices (1-based, relative to drawdown) |

Multiple obligations supported: `settings.debts[]` if populated (each obligation summed independently), else synthesized as a single obligation from the legacy `capital_structure.bank_loan` fields if `bank_loan > 0` (`generic-engine.ts:824-833`). **These two paths are mutually exclusive**, not additive — if `settings.debts` has any entries, `capital_structure.bank_loan` is ignored entirely regardless of its value.

**Formula**, per obligation, independently:

1. `startIdx = max(0, ob.drawdownMonth - 1)`, `monthlyRate = ob.annualRate / 12`, `tenor = ob.tenorMonths`, `grace = ob.gracePeriodMonths`.
2. `isDueMonth(mss)` (`mss` = months-since-start): `false` if `mss < grace || mss >= tenor`; else by type:
   - `bullet`: `mss === tenor - 1` (single repayment at the very end)
   - `quarterly`: `(mss - grace) % 3 === 0`
   - `seasonal`: `ob.seasonalMonths.includes(mss + 1)`
   - anything else (amortising, the default): `true` for every month once past grace and before tenor end
3. `totalPP` = count of due months across the **full tenor** (not capped at the visible plan window — a loan can run longer than the projection shows).
4. Walk months `m` from `startIdx` to `months-1`:
   `bal` starts at `ob.principal`; if `bal <= 0.01`, balance stays `0`, skip to next month.
   `mss = m - startIdx`
   `interest = bal * monthlyRate` → `interestByMonth[m] = interest`
   If `isDueMonth(mss)`:
     `bullet`: `principal = bal` (pay off everything)
     else: `principal = min(bal / max(1, totalPP - repayCount), bal)`, then `repayCount++` — **equal-principal, declining-interest amortization** (not the equal-total-payment/annuity method a consumer mortgage uses)
   else: `principal = 0`
   `principalByMonth[m] = principal`; `bal = max(0, bal - principal)`; `balanceByMonth[m] = bal`
5. Sum across every obligation: `totalInterest[m] = Σ interestByMonth[m]`, `totalPrincipal[m] = Σ principalByMonth[m]`, `totalRepayment[m] = totalInterest[m] + totalPrincipal[m]`, `totalOutstanding[m] = Σ balanceByMonth[m]`.

**Output.** `{totalInterest, totalPrincipal, totalRepayment, totalOutstanding}: number[]`, plus `annualY1 = Σ totalRepayment` (sum across ALL months returned, not literally "year 1" despite the name). Displayed as the "Loan Repayment Schedule" table on the Cash Flow tab (shown only when a loan genuinely exists, checked via `totalPrincipal`, `totalOutstanding`, OR `totalInterest` having any nonzero month — a bullet loan due beyond the visible window still shows via its accruing interest/outstanding balance).

**Edge cases.**
- `months` argument falsy: defaults to `12` (`months = months || 12`).
- `ob.drawdownMonth` beyond the plan's total months: the `for` loop (`m` from `startIdx`) never executes; that obligation contributes zero to every array for the visible window (consistent — it also contributes zero cash inflow in Cash Flow, §19).
- Multiple obligations with overlapping periods: summed independently per month, no interaction between them.

**Dependencies.** Feeds Interest Expense (§9), Financing Cash Flow (§19, both the drawdown and the repayment legs), Loan Liability on the Balance Sheet (§21, `= totalOutstanding`), DSCR (§25), Credit Risk Score (§24), Going Concern's debt factor (§26), Investment Readiness's debt factor (§27), Debt/EBITDA (§36), Gearing (§37).

**Known limitations.** No support for rate changes mid-loan, no refinancing modeling, no early-repayment/prepayment scenario.

---

## 18. Trade Credit

**Purpose.** Models supplier credit received (payables) and customer/partner credit extended (receivables), and the resulting working-capital cash timing effect.

**Location.** `scoring-engine.ts:74-155`, function `computeTradeCredit()`.

**Input variables.** `settings.trade_credit_lines[]`, each either a **balance-path** line (`monthly_balance: number[]`, the month-end outstanding balance entered directly) or a **legacy flow-path** line (`monthly_new[]`, `monthly_settled[]`), plus `line.type: 'payable' | 'receivable'`. Also `monthlyCostOfSales` (§2) and `monthlyRevenue` (§1) as DPO/DSO denominators.

**Formula.**

- **Balance path**: `B = max(0, line.monthly_balance[i])`. Payable: `cashEffect[i] = B - prevBalance`. Receivable: `cashEffect[i] = prevBalance - B`. (`prevBalance` starts at `0`.)
- **Flow path**: `settledAmt = min(rawSettledAmt, runningBalance + newAmt)` (settlement capped at what's actually outstanding). `runningBalance = max(0, runningBalance + newAmt - settledAmt)`. Payable: `cashEffect[i] = newAmt - settledAmt`. Receivable: `cashEffect[i] = settledAmt - newAmt`.
- Both paths, summed across all lines per month, into `monthlyCashEffect[i]`.
- `avgPayable = Σ totalPayableOutstanding / months`; `avgReceivable = Σ totalReceivableOutstanding / months`.
- `dpo = annualCogs > 0 ? (avgPayable / annualCogs) * 365 : 0` (Days Payable Outstanding)
- `dso = annualRev > 0 ? (avgReceivable / annualRev) * 365 : 0` (Days Sales Outstanding)
- `cashConversionGap = dso - dpo`

**Output.** `{totalPayableOutstanding, totalReceivableOutstanding, monthlyCashEffect}: number[]`, `dpo, dso, cashConversionGap: number` (days), `peakPayable, peakReceivable: number`. Displayed as "Cash cycle" (`cashConversionGap`) and individual DPO/DSO figures in Clearview Intelligence.

**Edge cases.**
- Over-settlement (settling more than is outstanding): capped, balance floors at `0`, cash effect only moves by what was genuinely outstanding — regression-tested for both payable and receivable directions.
- `annualCogs === 0` or `annualRev === 0`: `dpo`/`dso` are `0`, not `NaN` or `Infinity`.

**Dependencies.** Feeds the Balance Sheet's Accounts Receivable/Payable (§21) and Cash Flow's working-capital adjustment (§19). `cashConversionGap` feeds LRS Trust (paymentBehaviour) and Market Opportunity (§28) dimensions, and the Credit Risk Score (§24).

**Known limitations.** `computeTradeCreditByUnit()` exists for a per-unit breakdown (not detailed above; same formula, filtered by `unit_id`).

---

## 19. Cash Flow Statement

**Purpose.** Reconciles opening cash to closing cash via operating, financing, and investing activity, using the indirect method.

**Location.** `generic-engine.ts:980-1028`.

**Input variables.** `con.hybrid_npat` (§12), `con.depreciation` (§7), `tradeCreditCashEffect` (§18), `cap.shareholder_contribution`, `cap.grant_non_repayable`, `cap.grant_recoverable`, `cap.fixed_assets`, debt obligations' `principal`/`drawdownMonth` (§17), `debtSchedule.totalPrincipal` (§17), `settings.opening_cash_balance`.

**Formula.**

- **Operating Cash Flow**: `cf.op_cash[m] = hybrid_npat[m] + depreciation[m] + tradeCreditCashEffect[m]`. Depreciation is added back (non-cash; the real cash cost was already paid at purchase, see Investing below).
- **Financing Cash Flow**: `cf.fin_cash[0] = cap.shareholder_contribution + cap.grant_non_repayable + cap.grant_recoverable` (capital injections, month 0 only). Plus, for each debt obligation: `cf.fin_cash[drawdownMonth-1] += ob.principal` (the full principal, in one lump at drawdown). Minus, every month: `cf.fin_cash[m] -= debtSchedule.totalPrincipal[m]` (repayment outflow; interest is NOT here — it's already inside `hybrid_npat` via NBT, §10).
- **Investing Cash Flow**: `cf.inv_cash[0] = -cap.fixed_assets` (month 0 only; the entire asset cost as a single outflow).
- **Net / Open / Close**: `cf.net[m] = op_cash[m] + fin_cash[m] + inv_cash[m]`; `cf.open[0] = settings.opening_cash_balance`, `cf.open[m] = cf.close[m-1]` for `m > 0`; `cf.close[m] = cf.open[m] + cf.net[m]`.
- `cf.act_mask[m] = isPastOrCurrentMonth[m]` — display-only flag, same calendar rule as everywhere else.

**Output.** All `number[]`, currency, can be negative (an overdraft). Displayed as the Cash Flow Statement table, plus a "Cash at a glance" summary (`cashNow`, `Projected low`, `Months negative`, `Projected closing`).

**Edge cases.** An obligation whose `drawdownMonth` falls beyond `months`: the `if (idx < months)` guard means it contributes **zero** financing inflow — consistent with the Debt Schedule (§17) also contributing zero for that obligation in the visible window.

**Dependencies.** `cf.close` feeds the Balance Sheet's Cash (§21), Credit Risk's `cashGaps`/`minCash` (§24), LRS Profitability/Capacity/Resilience (§28) via `cashClose`, Cash Runway (§39), Current/Quick Ratio (§40).

**Known limitations.** No modeling of cash timing lags beyond what Trade Credit (§18) captures — e.g. no separate "days to collect a Clearview subscription fee" concept distinct from trade credit lines.

---

## 20. Cash Warning Months

**Purpose.** Flags every month where projected closing cash goes negative.

**Location.** `GenericDashboard.tsx:3566-3573`, function `findCashWarningMonths()`.

**Formula.** `warnings = cf.close.map((bal, i) => bal < 0 ? {month: months[i], balance: bal} : null).filter(Boolean)` (paraphrased; actual code pushes to an array inside a `forEach`).

**Output.** `{month: string, balance: number}[]`. Displayed as a red "Cash flow early warning" banner on the Cash Flow tab when non-empty, and as `metrics.min_cash` / `metrics.min_cash_month` (computed separately, see below) elsewhere.

**Related, separately computed**: `metrics.min_cash = Math.min(...cf.close)`, `metrics.min_cash_month = cf.close.indexOf(min) + 1` (`generic-engine.ts:1077-1078`).

**Dependencies.** Feeds `cashGaps` (count of negative months) used throughout scoring (§24, §26, §28).

---

## 21. Balance Sheet

**Purpose.** Point-in-time statement of assets, equity, and liabilities, with an enforced accounting identity.

**Location.** `generic-engine.ts:1030-1060`.

**Formula.**

- `bs.cash = cf.close` (§19)
- `bs.fixed_assets = depreciation.netBookValue` (§7)
- `bs.accounts_receivable = tradeCredit.totalReceivableOutstanding` (§18)
- `bs.total_assets[m] = cash[m] + fixed_assets[m] + accounts_receivable[m]`
- `bs.share_capital = flat cap.shareholder_contribution` (every month, constant)
- `bs.grant_equity = flat cap.grant_non_repayable`
- `bs.retained_earnings[m] = cum_npat`, where `cum_npat` starts at `settings.opening_cash_balance` and accumulates `+= hybrid_npat[m]` each month in order (see Known Limitations)
- `bs.total_equity[m] = share_capital[m] + grant_equity[m] + retained_earnings[m]`
- `bs.grant_liability = flat cap.grant_recoverable`
- `bs.loan_liability = debtSchedule.totalOutstanding` (§17)
- `bs.accounts_payable = tradeCredit.totalPayableOutstanding` (§18)
- `bs.total_liabilities[m] = grant_liability[m] + loan_liability[m] + accounts_payable[m]`
- `bs.total_equity_and_liabilities[m] = total_equity[m] + total_liabilities[m]`

**Output.** All `number[]`, currency. Displayed as the Balance Sheet table, plus a "Balance check" indicator comparing `total_assets` to `total_equity_and_liabilities` (tolerance `< 1` currency unit, accounting for floating-point drift).

**Edge cases.** None beyond the upstream sections' — every line is either a flat constant or a direct pass-through of an already-computed array.

**Dependencies.** `total_equity`/`total_liabilities` (latest month) feed Credit Risk (§24, via `deToEq`), Investment Readiness (§27, via `deToEq`), LRS Resilience (§28, `deToEq`/`leverageScore`), Gearing (§37), ROCE's capital-employed denominator (§35).

**Known limitations / assumptions.** Seeding `retained_earnings`' cumulative counter with `settings.opening_cash_balance` (a cash concept) is a deliberate modeling choice, not a literal accounting fact — it's what makes the identity balance for a client whose plan starts with pre-existing cash and no other recorded source for it (the alternative would be an un-sourced cash asset with no matching equity/liability, which breaks the identity outright). This assumes that pre-existing cash originated from accumulated profit, which may not always be true (it could equally be an unmodeled prior equity injection or loan). Recoverable grants (`grant_liability`) never amortize or get repaid — they sit as a static liability indefinitely, unlike bank loans which have a real repayment schedule.

---

## 22. Whole-Business Break-Even

**Purpose.** The consolidated (not per-line) break-even revenue for the entire business.

**Location.** `generic-engine.ts:1063-1067`.

**Formula.**
`total_fixed_annual = annual(sharedPool) + Σ over allocUnits of (annual(staff) + annual(opex))`
`total_cogs = annual(con.cogs)`, `total_rev = annual(con.rev)`
`variable_cost_pct = total_rev > 0 ? total_cogs / total_rev : 0`
`business_breakeven = variable_cost_pct < 1 ? total_fixed_annual / (1 - variable_cost_pct) : 0`

**Output.** `metrics.business_breakeven: number`, currency.

**Edge cases.** `variable_cost_pct >= 1`: returns `0` (same "avoid infinity" pattern as §15).

**Dependencies.** Feeds LRS Profitability's `breakeven` indicator (§28) and the "Break-Even Position" metric.

---

## 23. Scenario / Stress Test Multipliers

**Purpose.** Applies a whole-plan revenue and cost multiplier to model a named scenario (e.g. "Conservative," "Stress Test") without editing every line individually.

**Location.** `generic-engine.ts:474-475`, `553`; defaults defined in `defaultGenericConfig()` at `:231-236`.

**Input variables.** `settings.scenarios[]`, each `{id, label, rev_mult, cost_mult, active: boolean}`. Exactly one is expected to have `active: true` at a time (not enforced programmatically — `find()` returns the first match).

**Default scenarios** (from `defaultGenericConfig`):

| Scenario | `rev_mult` | `cost_mult` | Active by default |
|---|---|---|---|
| Conservative | `0.80` (−20%) | `1.10` (+10%) | No |
| Base Case | `1.00` | `1.00` | **Yes** |
| Optimistic | `1.20` (+20%) | `0.95` (−5%) | No |
| Stress Test | `0.70` (−30%) | `1.20` (+20%) | No |

**Formula.** `activeScenario = settings.scenarios?.find(s => s.active) ?? {rev_mult: 1, cost_mult: 1}`. Every revenue-category line's value is multiplied by `rev_mult`; every cost-category line's value (COGS, staff, opex, shared) is multiplied by `cost_mult` — applied at the point each line is accumulated into `rev[m]`/`cogs[m]`/etc. (§1, §2, §4).

**Output.** Not a standalone metric — a whole-plan-wide multiplier baked into every downstream figure when a non-Base scenario is active.

**Edge cases.** No scenario marked active: falls back to `{rev_mult: 1, cost_mult: 1}` (equivalent to Base Case).

**Known limitations.** This is the entirety of ClearView's "stress test" capability — a single flat multiplier applied uniformly across every line and every month. There is no per-line, per-month, or probability-weighted scenario modeling, and no automated "which scenario breaches covenant X" analysis.

---

## 24. Credit Risk Score

**Purpose.** A 0–100 composite score of default risk, built from debt service coverage, cash stability, revenue trend, and trade credit quality.

**Location.** `scoring-engine.ts:492-517`, inside `computeScores()`.

**Input variables.** `dscrMin` (§25), `hasDebt` (`= debtObligations.some(ob => ob.principal > 0)`), `cashGaps` (count of negative-cash months, §20), `revTrend` (see below), `tradeCredit.dso`/`.dpo`/`.cashConversionGap` (§18).

**Formula.** Starts at `score = 50`, then additively:

```
if hasDebt && dscrMin !== null:
    if dscrMin >= 1.5:  score += 30
    elif dscrMin >= 1.0: score += 15
    elif dscrMin < 0.5:  score -= 20
    (0.5 <= dscrMin < 1.0: no adjustment)

if cashGaps === 0:      score += 20
elif cashGaps > 2:      score -= 10
(1-2 cash gaps: no adjustment)

if revTrend === 'Growing':    score += 10
elif revTrend === 'Declining': score -= 5

if dso > 0 || dpo > 0:
    if cashConversionGap <= 0:  score += 5
    elif cashConversionGap > 60: score -= 10
    elif cashConversionGap > 30: score -= 5

score = max(0, min(100, score))
```

`revTrend`: `quarterLen = max(1, floor(months/4))`; `q1Rev = Σ` first `quarterLen` months' revenue; `q4Rev = Σ` last `quarterLen` months' revenue. `'Growing'` if `q4Rev > q1Rev * 1.05`; `'Declining'` if `q4Rev < q1Rev * 0.95`; else `'Stable'`.

**Output.** `score: number` (0–100 integer-valued in practice), `classification: 'Stable' | 'At Risk' | 'High Risk'` (`>= 65` Stable, `>= 40` At Risk, else High Risk), `classColor` (a hex string).

**Edge cases.** No debt at all: the DSCR adjustment block is skipped entirely (not scored as if failing) — `hasDebt` gates it.

**Dependencies.** Independent composite; not itself consumed by another score, though it shares inputs (DSCR, cashGaps) with Going Concern (§26).

**Known limitations.** The `50` starting point and every point adjustment (`+30/+15/-20/+20/-10/+10/-5/+5/-10/-5`) and threshold (`1.5/1.0/0.5`, `2/60/30`, `1.05/0.95`) are fixed, hand-set constants — not derived from any statistical model, backtested default data, or lender-specific calibration.

---

## 25. DSCR (Debt Service Coverage Ratio)

**Purpose.** EBITDA available to cover debt service, for periods where a real repayment is actually due.

**Location.** `scoring-engine.ts:459-471`.

**Formula.** `hasDebt = debtObligations.some(ob => (ob.principal || 0) > 0)`. Per month `i`: `ds = debtSchedule.totalRepayment[i]`; `dscrVals[i] = ds > 0 ? ebitda[i] / ds : null`. `dscrMin = min(...dscrVals.filter(v => v !== null))`, or `null` if no month has a real repayment due.

**Output.** `dscrVals: (number | null)[]`, `dscrMin: number | null`. Display via `dscrLabel()`/`dscrRating()`/`dscrColor()` (`scoring-engine.ts:668-687`): `'N/A — No Debt'` if `!hasDebt`; `'N/A — No Repayment Due Yet'` if `dscrMin === null`; else `${dscrMin.toFixed(2)}x`, rated `'Strong'` (`>= 1.5`), `'Adequate'` (`>= 1.0`), or `'Below threshold'`.

**Edge cases.** This is deliberately **never an average** — a month with no repayment due (before drawdown, during grace, or after full repayment) contributes `null`, not a fabricated `0` or a skipped-but-still-averaged value. `dscrMin` is the minimum across only the months where a real obligation existed.

**Dependencies.** Feeds Credit Risk (§24), Going Concern's debt factor (§26), LRS Resilience's `debtExposure` (§28).

---

## 26. Going Concern Score

**Purpose.** A 0–20 composite assessing whether the business can continue operating, across five equally-important factors (each 0–4, except management which is 0–5... see note below).

**Location.** `scoring-engine.ts:519-538`.

**Formula.** Five factors, summed then capped at 20:

- `gcDebtServiceFactor`: `!hasDebt` → `4`; `dscrMin === null` (debt exists, grace period) → `3`; else `dscrMin >= 1.5` → `4`, `>= 1.0` → `3`, `>= 0.5` → `2`, else `1`.
- `gcLiquidityFactor`: `minCash >= 0` → `4`; `minCash > -10,000,000` → `1`; else → `0`. (Note: `-10,000,000` is a raw currency-unit constant, not scaled to the client's actual currency/scale — see Known Limitations.)
- `gcRevenueSustainabilityFactor`: if trade credit data exists (`dso > 0 || dpo > 0`): `cashConversionGap <= 0` → `4`, `<= 30` → `3`, `<= 60` → `2`, else `1`. No trade credit data: flat `3` ("no data entered — default adequate").
- `gcProfitabilityFactor`: `annualEbitda > 0` → `3`, else `2`.
- `gcManagementFactor`: `assessOrDefault(assess.managementCapability)` — a direct 0–5 Business Profile input (defaults to `2` if null/undefined/non-numeric, via `assessOrDefault()`, which explicitly does NOT use `|| 2` so a genuine `0` rating is preserved).

`gcScore = min(20, gcDebtServiceFactor + gcLiquidityFactor + gcRevenueSustainabilityFactor + gcProfitabilityFactor + gcManagementFactor)`

**Output.** `gcScore: number` (0–20), `gcRating: 'Strong' | 'Adequate' | 'Marginal' | 'Concern'` (`>= 17` Strong, `>= 12` Adequate, `>= 7` Marginal, else Concern), `gcColor`. Each factor also individually exposed (`gcDebtServiceFactor`, etc.) so the UI can show a per-indicator trend.

**Edge cases.** As above — no-debt and no-trade-credit-data cases have explicit, documented fallback values rather than a fabricated computed ratio.

**Dependencies.** Consumed by `computeViabilityRating()` (§30) alongside the Credit Risk Score.

**Known limitations.** `gcLiquidityFactor`'s `-10,000,000` threshold is a hardcoded absolute currency value with no adjustment for the client's currency or business scale — a UGX-denominated business (where amounts are routinely in the tens of millions) and a USD-denominated business are scored against the identical raw number. The five factors are summed unweighted (implicitly equal-weighted at their own individual max values, which aren't even uniform — 4/4/4/3/5 possible maxima — so this isn't strictly a "5 equally-weighted factors out of 4 each" design despite reading that way at first glance).

---

## 27. Investment Readiness Score

**Purpose.** A 0–30 composite assessing investment readiness across financial health, debt capacity, and four qualitative Business Profile dimensions.

**Location.** `scoring-engine.ts:540-550`.

**Formula.**

- `ebitdaMargin = annualRevenue > 0 ? annualEbitda / annualRevenue : 0`
- `deToEq = totalEquity > 0 ? totalLiabilities / totalEquity : 99` (a business with no/negative equity is scored as maximally leveraged, `99`, rather than a division error)
- `irFinancial = min(5, (ebitdaMargin>=0.2 ? 2 : ebitdaMargin>=0.05 ? 1 : 0) + (annualEbitda>0 ? 1 : 0) + (deToEq<1 ? 2 : deToEq<2 ? 1 : 0))`
- `irDebt`: `!hasDebt` → `5`; `dscrMin === null` → `3`; else `min(5, round(dscrMin>=2 ? 5 : dscrMin>=1.5 ? 4 : dscrMin>=1 ? 3 : 2))`
- `irScore = min(30, irFinancial + irDebt + assessOrDefault(commercialModel) + assessOrDefault(managementCapability) + assessOrDefault(marketEvidence) + assessOrDefault(governance))`

**Output.** `irScore: number` (0–30), `irTier: 'Investment Ready' | 'Near Ready' | 'Development Stage' | 'Pre-Investment'` (`>= 24`, `>= 17`, `>= 10`, else), `irColor`. Sub-factors `irFinancial` (0–5) and `irDebt` (0–5) individually exposed.

**Edge cases.** Same no-debt/grace-period handling as DSCR/Going Concern — explicit fixed values (`5`/`3`), never a fabricated ratio.

**Dependencies.** Independent composite.

**Known limitations.** `irFinancial`'s three internal thresholds (`0.2`/`0.05` margin, `1`/`2` leverage) and `irDebt`'s DSCR bands (`2`/`1.5`/`1`) are, like Credit Risk's, fixed hand-set constants.

---

## 28. Liquidity Readiness Score (LRS)

**Purpose.** "The extent to which an enterprise has the characteristics required for productive liquidity to flow into it" — one 0–100 score across seven weighted dimensions, each averaging five 0–100 indicators.

**Location.** `liquidity-readiness.ts`, full file.

**The seven dimensions and their weights** (`LRS_WEIGHTS`, must sum to 1.0):

| Dimension | Weight |
|---|---|
| Market Opportunity | 0.20 |
| Visibility | 0.15 |
| Trust | 0.15 |
| Profitability | 0.15 |
| Capacity | 0.15 |
| Resilience | 0.10 |
| Compliance | 0.10 |

**Normalization primitives:**
- `ramp(value, lo, hi) = clamp(0, 100, ((value - lo) / (hi - lo)) * 100)` — linear 0–100 scaling between two bounds; `hi === lo` special-cases to `value >= hi ? 100 : 0`.
- `inverseRamp(value, lo, hi) = 100 - ramp(value, lo, hi)` — for metrics where lower is better (e.g. DPO).
- `qualitative(value) = clamp(0, 100, (value / 5) * 100)` — converts a 0–5 Business Profile rating to 0–100.
- `average(values) = Σ values / count` (dimension score = average of its 5 indicators).

**Dimension formulas** (each indicator, then the dimension score = `average()` of all five):

**Market Opportunity** (weight 0.20):
1. `revenueGrowth = ramp(revenueGrowthRate, -0.20, 0.30)`
2. `grossMargin = revenue>0 ? ramp(grossProfit/revenue, 0, 0.40) : 0`
3. `commercialModel = qualitative(assess.commercialModel)`
4. `customerGrowth`: `customersAcquired<=0` → `0`; `<=5` → `40`; `<=20` → `70`; else `100`
5. `marketEvidence = qualitative(assess.marketEvidence)`

**Visibility** (weight 0.15):
1. `digitallyCaptured = monthsOfActualData>0 ? ramp(fieldAppMonths/monthsOfActualData, 0, 1) : 0`
2. `statementsComplete = monthsElapsed>0 ? ramp(monthsOfActualData/monthsElapsed, 0, 1) : 0`
3. `recordsComplete = monthsElapsed>0 ? ramp(monthsClosed/monthsElapsed, 0, 1) : 0`
4. `kpiReporting = qualitative(assess.kpiReporting)`
5. `historicalData = ramp(monthsOfActualData, 0, 12)`
   Then: `base = average(the five above)`; `verifiedShare = clamp01(verifiedValueShare ?? 0)`; **`score = min(100, base + 15 * verifiedShare)`** — a capped **uplift** (§43's `verifiedValueShare`), stacked on top, never subtracted. With no reconciliation data linked, `verifiedValueShare` is `undefined` → `verifiedShare = 0` → score is exactly `base`, unchanged from pre-verification behavior.

**Trust** (weight 0.15):
1. `paymentBehaviour = tradeCreditDpo<=0 ? 50 : inverseRamp(dpo, 30, 90)`
2. `supplierRelationships = qualitative(assess.supplierRelationships)`
3. `auditTrail = qualitative(assess.auditTrail)`
4. `governance = qualitative(assess.governance)`
5. `dataConsistency`: `cashGaps===0` → `100`; `<=2` → `60`; else `20`

**Profitability** (weight 0.15):
1. `netMargin = revenue>0 ? ramp(ebitda/revenue, 0, 0.30) : 0`
2. `cashFlow`: `cashGaps===0 && lastCashClose>=0` → `100`; `cashGaps<=2` → `50`; else `10`
3. `roi = irr===null ? 50 : ramp(irr, 0, 0.40)`
4. `grossMargin` (same formula as Market Opportunity's)
5. `breakeven = businessBreakeven>0 ? ramp(revenue/breakeven, 0, 1.2) : (revenue>0 ? 100 : 0)`

**Capacity** (weight 0.15):
1. `productionCapacity = qualitative(assess.productionCapacity)`
2. `managementSystems = qualitative(assess.managementCapability)`
3. `staffCapability = revenuePerHead>0 ? ramp(revenuePerHead, 0, 20,000,000) : 0`
4. `workingCapital = latestMonthlyOpex>0 ? ramp(currentCash/latestMonthlyOpex, 0, 3) : (currentCash>0 ? 100 : 0)`
5. `inventoryAvailability = qualitative(assess.inventoryAvailability)`

**Resilience** (weight 0.10):
1. `cashReserve = latestMonthlyOpex>0 ? ramp(currentCash/latestMonthlyOpex, 0, 6) : (currentCash>0 ? 100 : 0)`
2. `customerDiversification = qualitative(assess.customerDiversification)`
3. `supplierDiversification = qualitative(assess.supplierDiversification)`
4. `debtExposure`: `deToEq = totalEquity>0 ? totalLiabilities/totalEquity : 99`; `leverageScore = inverseRamp(deToEq, 0.5, 2.0)`; `dscrScore = hasDebt && dscrMin!==null ? ramp(dscrMin, 0.5, 2.0) : null`; `debtExposure = dscrScore!==null ? (leverageScore+dscrScore)/2 : leverageScore`
5. `businessContinuity = qualitative(assess.businessContinuity)`

**Compliance** (weight 0.10):
1. `registration = qualitative(assess.registrationCompliance)`
2. `tax = qualitative(assess.taxCompliance)`
3. `licences = qualitative(assess.licenceCompliance)`
4. `financialReporting = monthsElapsed>0 ? ramp(monthsClosed/monthsElapsed, 0, 1) : 0`
5. `policies = qualitative(assess.governance)` (shared with Trust's `governance` indicator — same underlying input, two different dimensions)

**Final score.** `score = Σ dimension.score * LRS_WEIGHTS[dimension]` (weighted average across all 7).

**Output.** `LRSResult { score: number (0-100), dimensions: {7 × LRSDimensionScore} }`. Each `LRSDimensionScore` carries its 5 underlying `indicators` (label/value/note) for full transparency in the UI. Displayed as a 0–100 score with color banding (`scoreColorLRS`: `>=70` green, `>=50` teal, `>=30` amber, else red).

**Edge cases (representative, not exhaustive — see each dimension above).** Every ramp-based indicator has an explicit `> 0` guard before dividing; every qualitative indicator defaults through `assessOrDefault` (in `scoring-engine.ts`, reused here) to `2` only for a genuinely missing rating, never overwriting a real `0`.

**Dependencies.** Feeds Bank Fit / Investor Fit (§29) directly — those are simply this same 7-dimension result, re-weighted.

**Known limitations / assumptions.** Roughly half the 35 total indicators (7 dimensions × 5) are qualitative Business Profile inputs (`CoachAssessment`), captured as a manually-entered 0–5 rating rather than derived from any data the platform tracks — explicitly documented in the file's header comment as a deliberate honesty choice over fabricating a data-derived number. Every ramp band (e.g. revenue growth `-20%..30%`, gross margin `0..40%`, DPO `30..90` days) is a "reasonable generalist default," not sector-calibrated or empirically validated — documented in-file as something a coach should sanity-check for a specific sector or lender relationship, not treat as precise.

---

## 29. Bank Fit / Investor Fit Scores

**Purpose.** The same LRS 7-dimension result, re-weighted for a specific liquidity-provider lens.

**Location.** `liquidity-readiness.ts:295-308`.

**Formula.** `computeFitScore(lrsResult, weights)`: `totalWeight = Σ weights`; if `<= 0` return `0`; else `Σ (dimension.score * weight) / totalWeight` — a weighted average using only the dimensions present in the supplied `weights` map (so if a preset omits a dimension, or supplies partial weights not summing to 1, the result is still a valid weighted average via the normalizing division).

**Presets** (`FIT_SCORE_PRESETS`):

| Dimension | Bank Fit | Investor Fit |
|---|---|---|
| Market Opportunity | 0.15 | 0.30 |
| Visibility | 0.20 | 0.10 |
| Trust | 0.25 | 0.15 |
| Profitability | 0.20 | 0.15 |
| Capacity | 0.10 | 0.15 |
| Resilience | 0.05 | 0.05 |
| Compliance | 0.05 | 0.10 |

(Both preset weight sets sum to exactly 1.00.)

**Output.** `number` (0–100), same scale/interpretation as LRS itself.

**Dependencies.** Fully derived from LRS (§28) — no independent inputs.

**Known limitations.** Only two presets exist (`bank`, `investor`) — "Buyer Fit" or "Programme Fit" lenses mentioned conceptually in the file's header comment as possible future re-weightings are not implemented.

---

## 30. Viability Rating

**Purpose.** A single plain-word rating combining Going Concern and Credit Risk.

**Location.** `scoring-engine.ts:658-663`, function `computeViabilityRating(gcScore, creditScore)`.

**Formula.**
```
if gcScore >= 15 && creditScore >= 65: 'Viable'
elif gcScore >= 10 && creditScore >= 40: 'Conditionally Viable'
elif gcScore >= 7: 'At Risk'
else: 'Not Viable'
```

**Output.** One of four string labels.

**Dependencies.** Pure function of Going Concern (§26) and Credit Risk (§24) — no other inputs.

---

## 31. Net Present Value (NPV)

**Purpose.** Discounted value of the business's projected free cash flow, from a capital provider's perspective.

**Location.** `investment-metrics.ts:35-37`, `computeNPV()`.

**Input variables.** `cashFlows: number[]` (see §33's `buildInvestmentCashFlows`), `discountRate` (a **monthly** rate — see Known Limitations) — in the UI, `discountRate` state defaults to `0.15` (15% annual), user-adjustable, converted via `annualRateToMonthlyRate()`.

**Formula.** `NPV = Σ_t CF[t] / (1 + r)^t`, standard.

**Output.** Currency. Displayed with a green/red color by sign.

**Dependencies.** `cashFlows[0]` = `-capitalAtRisk` (§33); `cashFlows[1..n]` = monthly Free Cash Flow = `op_cash[i] + inv_cash[i]` (§19).

**Known limitations.** `capitalAtRisk = shareholder_contribution + grant_recoverable` — non-repayable grants and bank loan principal are deliberately excluded (a grantor isn't expecting an NPV/IRR-style return; debt already has its own return captured via DSCR/interest).

---

## 32. Internal Rate of Return (IRR)

**Purpose.** The discount rate at which NPV = 0 — the annualized return the projected cash flows imply.

**Location.** `investment-metrics.ts:52-88`, `computeIRR()`.

**Formula.** Numerical solve, no closed form:
1. Guard: `hasPositive = cashFlows.some(cf>0)`, `hasNegative = cashFlows.some(cf<0)`. If either is false, **return `null`** immediately (no real IRR exists for an all-one-sign series).
2. **Newton-Raphson**, up to `maxIterations` (100), starting at `rate = 0.1`: if `|NPV(rate)| < tolerance` (1e-7), return `rate`. Else step `rate -= NPV(rate)/NPV'(rate)`; break out to bisection if the derivative is `0` or the next rate is non-finite or `<= -1`.
3. **Bisection fallback**: search `lo=-0.99` to `hi=10` (−99% to +1000%). If `NPV(lo)` and `NPV(hi)` have the same sign, **return `null`** (no bracketed root found). Otherwise bisect up to `maxIterations` times, returning the midpoint once `|NPV(mid)| < tolerance` or iterations are exhausted.

The raw result is a **monthly** rate (since the cash flow series is monthly); the caller annualizes via `monthlyRateToAnnualRate(r) = (1+r)^12 - 1` before display or comparison against an annual hurdle rate.

**Output.** `number | null` (monthly rate; UI shows the annualized value). Green if `irr > discountRate`, else red.

**Edge cases.** Explicitly returns `null` — never a wrong or misleading number — for: no sign change in the cash flow series at all, or neither Newton-Raphson nor bisection converging. Displayed as `'N/A'` / `'No real IRR (check cash flow signs)'`.

**Dependencies.** Feeds LRS Profitability's `roi` indicator (§28) and the "Metrics investors and banks look at" IRR display.

---

## 33. Payback Period

**Purpose.** Years until cumulative cash flow (capital-at-risk + free cash flow) turns non-negative.

**Location.** `GenericDashboard.tsx:3859-3864`.

**Formula.**
```
if capitalAtRisk <= 0: return null
cum = 0
for i in 0..len(lrsCashFlows)-1:
    cum += lrsCashFlows[i]
    if cum >= 0: return i / 12
return null  (never recovered within the projection window)
```

**Output.** `number | null`, years (fractional, since `i` is a month index divided by 12). Displayed as `${years.toFixed(1)}y` or `'n/a'`.

**Dependencies.** Same `lrsCashFlows` series as NPV/IRR (§31/§32).

---

## 34. Revenue CAGR

**Purpose.** Compound annual growth rate of revenue, across full calendar years only.

**Location.** `GenericDashboard.tsx:3853-3855`.

**Formula.** `annualRevs = [sum of con.rev for each full-12-month calendar year]`. If `annualRevs.length >= 2 && annualRevs[0] > 0`:
`revenueCagr = (annualRevs[last] / annualRevs[0]) ^ (1/(count-1)) - 1`
Else `null`.

**Output.** `number | null`, ratio. Displayed as a percentage or `'n/a'`.

**Edge cases.** Fewer than two full calendar years in the plan: `null` — deliberately excludes partial start/end years from distorting the growth rate.

---

## 35. Return on Capital Employed (ROCE)

**Purpose.** EBIT as a return on the capital actually employed in the business (equity + debt).

**Location.** `GenericDashboard.tsx:3842-3844`.

**Formula.** `capitalEmployed = totalEquity[last] + loanLiability[last]`; `roce = capitalEmployed>0 ? annualEbit/capitalEmployed : null`, where `annualEbit` is EBIT (§8) summed over the latest full calendar year (falling back to the last available year group for a plan shorter than 12 months).

**Output.** `number | null`, ratio, displayed as a percentage.

---

## 36. Debt / EBITDA

**Purpose.** Leverage relative to earning power — a standard lender covenant metric.

**Location.** `GenericDashboard.tsx:3845`.

**Formula.** `hasDebt && annualEbitda>0 ? loanLiability[last] / annualEbitda : null`, where `annualEbitda` is EBITDA (§6, deliberately not EBIT — conventional for this specific ratio) summed over the latest full calendar year.

**Output.** `number | null`, displayed as `${x.toFixed(1)}x`.

---

## 37. Gearing (Debt / Equity)

**Purpose.** Leverage relative to the owners' stake.

**Location.** `GenericDashboard.tsx:3846`.

**Formula.** `hasDebt && totalEquity[last]>0 ? loanLiability[last] / totalEquity[last] : null`.

**Output.** `number | null`, displayed as `${x.toFixed(1)}x`.

---

## 38. Interest Cover

**Purpose.** How many times over EBIT covers the annual interest bill.

**Location.** `GenericDashboard.tsx:3847`.

**Formula.** `annualInterest>0 ? annualEbit/annualInterest : null`, both summed over the latest full calendar year.

**Output.** `number | null`, displayed as `${x.toFixed(1)}x`.

---

## 39. Cash Runway

**Purpose.** Months of operating cost the current cash balance can cover, at the latest month's actual spend rate.

**Location.** `GenericDashboard.tsx:3848-3850`.

**Formula.** `latestOpex>0 ? currentCash/latestOpex : null`, where `currentCash = cf.close[lastMonth]` and `latestOpex = con.opex[lastMonth]` — the **discrete latest month's** figure, not an average across the period.

**Output.** `number | null`, months. Displayed as `${x.toFixed(1)} mo`, colored navy if `>= 3` else amber.

---

## 40. Current Ratio / Quick Ratio

**Purpose.** Short-term liquidity — ability to cover liabilities due within the next 12 months.

**Location.** `GenericDashboard.tsx:4332-4348`.

**Formula.**
`currentAssets = max(0, cashLast) + receivablesLast` (cash floored at zero for the ratio — a negative balance is an overdraft, flagged separately by §20)
`loanCurrentPortion = Σ debtSchedule.totalPrincipal, for the 12 months starting at the current actual/plan boundary`
`currentLiabilities = payablesLast + loanCurrentPortion`
`ratio = currentLiabilities>0 ? currentAssets/currentLiabilities : 'n/a'`

**Quick ratio = current ratio, identically** — the code comment explicitly states this is because no inventory is held on the Balance Sheet, so there's nothing to subtract from current assets to get the "quick" (most-liquid) subset.

**Output.** `number | 'n/a'`, displayed to 2 decimal places, colored green (`>=1.5`), amber (`>=1`), or red.

**Known limitations.** Quick ratio being identical to current ratio is a direct consequence of the Balance Sheet (§21) never modeling inventory — this is not a simplification within the ratio calculation itself, but inherited from an absent Balance Sheet line.

---

## 41. Customer Growth / Blended CAC

**Purpose.** Whole-business customer acquisition volume and blended cost, from recorded marketing events.

**Location.** `investment-metrics.ts:118-137`, `computeCustomerGrowthSummary()`.

**Formula.**
`totalCustomersAcquired = Σ evt.customers_acquired`
`totalAcquisitionCost = Σ evt.cost`
`totalRevenueLift = Σ max(0, evt.revenue_after - evt.revenue_before)` (floored at 0 — a decline is never counted as a negative "lift")
`blendedCAC = totalCustomersAcquired>0 ? totalAcquisitionCost/totalCustomersAcquired : null`

**Output.** `{totalCustomersAcquired, totalAcquisitionCost, blendedCAC: number|null, totalRevenueLift}`.

**Edge cases.** Zero customers acquired: `blendedCAC = null`, not a divide-by-zero.

**Dependencies.** `totalCustomersAcquired` feeds LRS Market Opportunity's `customerGrowth` indicator (§28).

---

## 42. Reconciliation Match Result

**Purpose.** Pairs field-app-logged sales against real inbound mobile-money payments, so a sale can be verified by two independent sources rather than self-declared.

**Location.** `reconciliation-engine.ts:119-220`, function `reconcile()`.

**Input variables.** `fieldEntries: FieldEntry[]` (`id, clientId, businessUnitId, amount, paymentMethod, capturedAt, alreadyMatched`), `providerTxns: ProviderTxn[]` (`id, clientId, amount, occurredAt, direction, alreadyMatched`), `config: {windowMinutes = 15, amountTolerance = 0}`.

**Formula.**
1. Eligibility filter: a field entry is a candidate only if `paymentMethod === 'mobile_money' && !alreadyMatched && capturedAt != null`. A provider txn is a candidate only if `direction === 'inbound' && !alreadyMatched`.
2. Build every feasible pair (same `clientId`, `|capturedAt - occurredAt| <= windowMinutes*60000`): exact match if `|amount_field - amount_provider| <= 1e-6`; near-miss if a nonzero `amountTolerance` is set and the delta falls within it.
3. **Greedy bipartite matching** on exact pairs only: sort by `(timeGapMs, amountDelta, field.id, provider.id)` ascending (fully deterministic — no clock, no randomness), then commit pairs in that order, each side usable only once.
4. Unmatched field entries → `declaredOnly` (includes non-mobile-money and no-`capturedAt` entries too — they were never eligible, but remain real declared sales). Unmatched inbound provider txns → `unattributedInbound`.
5. **Review candidates**: near-miss pairs where both sides remain unmatched (possibly the same sale net of a provider fee) — one entry per such pair, plus a single `count_imbalance` note if unmatched eligible field entries and unmatched inbound payments coexist.

**Output.** `{matches: Match[], declaredOnly: string[], unattributedInbound: string[], reviewCandidates: ReviewCandidate[]}`.

**Edge cases.** Amounts are matched **exactly** by default (`amountTolerance` defaults to `0`) — a tolerance never forces an automatic match, it only surfaces a near-miss for human review. Non-mobile-money entries and legacy rows with no `capturedAt` are never matching candidates but still count as real declared sales.

**Dependencies.** Feeds Verified Value Share (§43) and, downstream, `reconciliation_state` on `provider_transactions` (consumed by the client-facing resolve UI and the Verification Confidence Score, §44).

**Known limitations.** Runs against a single client's data per call (caller's responsibility to scope it — mixing clients "wastes work" per the code comment, though the engine itself also filters on `clientId` as a guard). No fuzzy/partial-amount matching beyond the explicit `amountTolerance` near-miss surfacing.

---

## 43. Verified Value Share

**Purpose.** The fraction of a client's mobile-money-tagged sales value that's confirmed by an independent, matched payment.

**Location.** `reconciliation-engine.ts:229-239`, function `verifiedValueShare()`.

**Formula.** `matchedValue = Σ entries where entry.id ∈ matched field-entry ids, of entry.amount`. `mobileMoneyValue = Σ entries where paymentMethod==='mobile_money', of entry.amount`. `mobileMoneyValue<=0 ? 0 : clamp01(matchedValue/mobileMoneyValue)`.

**Output.** `number`, 0–1.

**Dependencies.** Feeds LRS Visibility's uplift term directly (§28, `VISIBILITY_VERIFICATION_UPLIFT * verifiedShare`) and Verification Confidence's `verifiedShare` (§44, via a differently-scoped share — see that section's note).

---

## 44. Verification Confidence Score & Label

**Purpose.** How much a specific period's declared figures can be trusted — combining record consistency/completeness (always achievable) with payment verification (a bonus, never a gate).

**Location.** `confidence.ts:88-131`, function `assessConfidence()`.

**Input variables (`PeriodSignals`).** `matchedValue`, `unattributedInboundValue`, `declaredValue` (all currency), `hasActuals`, `recordsComplete`, `cogsConsistent`, `internallyConsistent` (all boolean), `monthsConsistentStreak` (count), `monthClosedOnTime` (boolean).

**Constants.** `VERIFIED_SHARE_THRESHOLD = 0.5`; `CONSISTENCY_STREAK_FOR_BADGE = 3`; `UNATTRIBUTED_FLAG_SHARE = 0.25`; `CONSISTENCY_POINTS = 40`; `COMPLETENESS_POINTS = 30`; `VERIFICATION_POINTS = 30` (sums to 100).

**Formula.**
1. `verifiedShare = declaredValue<=0 ? 0 : clamp01(matchedValue/declaredValue)` — **note this is a differently-scoped ratio than §43**: here the denominator is total *declared revenue* for the period, not mobile-money-tagged value specifically.
2. `unattributedShare = declaredValue>0 ? unattributedInboundValue/declaredValue : 0`
3. **Base score** (achievable with zero verification): `+= 40` if `internallyConsistent`. `+= 30 * (recordsComplete ? 1 : 0.5)` if `hasActuals` (i.e. half credit for having some actuals but not a complete record).
4. **Verification bonus**, stacked on top: `+= 30 * verifiedShare`.
5. `score = round(clamp(0, 100, sum))`.
6. **Label**, in priority order: `flagged` if `(!internallyConsistent && hasActuals) || unattributedShare > 0.25`; else `verified` if `verifiedShare >= 0.5`; else `triangulated` if `cogsConsistent && hasActuals && internallyConsistent`; else `self_reported_plausible` (the honest floor).

**Output.** `{label: ConfidenceLabel, score: 0-100, verifiedShare: 0-1, reasons: string[], badges: Badge[]}`. Displayed via `CONFIDENCE_DISPLAY` (`verification-display.ts:20-41`) as a title + blurb + tone (`good`/`neutral`/`warn`) and a conic-gradient ring showing the numeric score.

**Edge cases.** A cash-only or unlinked business (zero `matchedValue`/`unattributedInboundValue`) is **never penalized** by the mere existence of the verification system — this is the explicit, tested load-bearing design rule (§7 of `docs/RECONCILIATION_SPEC.md`): the base 70 points (consistency + completeness) is reachable with zero payment data. A genuine red flag (inconsistency, or inbound payments materially exceeding declared revenue) overrides an otherwise-good score regardless of the numeric total.

**Dependencies.** Feeds Recognition Badges (§45) via `deriveBadges()`.

**Known limitations.** `cogsConsistent` (used for the `triangulated` label) is currently always passed as `false` by the one caller (`VerificationRecognition.tsx:92`, comment: "deepened when the triangulation fallback is wired") — the COGS-based triangulation path is architecturally present but not yet actually fed real data, so a period can never currently reach the `triangulated` label in practice, only `self_reported_plausible`.

---

## 45. Recognition Badges

**Purpose.** Four independent, binary achievement badges recognizing good record-keeping and verification behavior.

**Location.** `confidence.ts:79-86`, function `deriveBadges()`.

**Formula.**
```
payments_verified:      matchedValue > 0
consistently_reported:  monthsConsistentStreak >= 3
records_complete:       recordsComplete === true
books_closed:           monthClosedOnTime === true
```

**Output.** `Badge[]`, a subset of the four. Displayed via `BADGE_DISPLAY` (icon + title + earned/how-to-earn blurb) in `BADGE_ORDER` (`payments_verified`, `consistently_reported`, `records_complete`, `books_closed`), split into earned vs. locked by `partitionBadges()`.

**Dependencies.** Purely derived from the same `PeriodSignals` as §44 — no independent inputs.

---

## 46. Wallet-Link Readiness Status

**Purpose.** Communicates how close a client is to automatic mobile-money verification being active.

**Location.** `VerificationRecognition.tsx:31-64`; display copy in `verification-display.ts:85-106`.

**Formula.** Reads `provider_links.status` for the client; if multiple links exist, the "most-progressed" wins via `STATUS_RANK` (`not_started`:0, `wallet_activated`:1, `link_pending`:2, `tier1_active`:3).

**Output.** One of four states, each with a title/blurb/tone via `READINESS_DISPLAY`.

**Status: Partially built.** This is a **display-only** status read from `provider_links.status` — there is no code in this repository (within scope) that actually drives a link through these states (no wallet-activation flow, no provider OAuth/API connection UI). The component gracefully defaults to `not_started` ("works today on your own records") when no links exist, which is the practical state for every client today.

---

## 47. Month-End Exception Report

**Purpose.** Surfaces data-quality issues before a period can be closed — a stale catalogue cost price (blocking) or a large revenue-vs-plan deviation (informational only).

**Location.** `month-end-close.ts:38-86`.

**Constants.** `COST_PRICE_STALENESS_DAYS = 90`; `REVENUE_ANOMALY_THRESHOLD = 0.5` (50%).

**Formula.**
- `isCostPriceStale(item, now)`: `false` if `cost_price` is null/undefined (nothing to go stale); `true` if `cost_price` is set but `cost_price_updated_at` is unset; else `true` if `(now - cost_price_updated_at) in days > 90`.
- Revenue anomaly, per unit: skipped entirely if `actual_revenue === null` (no actual data yet) or `planned_revenue === 0` (avoids a meaningless infinite-deviation result). Else `deviation = |actual - planned| / planned`; flagged if `> 0.5`.

**Output.** `ExceptionItem[]`, each `{type: 'stale_cost_price'|'revenue_anomaly', severity: 'blocking'|'informational', message, ref_id}`.

**Dependencies.** Feeds Period Close Eligibility (§48) directly.

**Known limitations.** Revenue anomaly is deliberately never blocking — the code comment states a hard block here would be "too rigid" given legitimate causes (a big one-off sale, genuine seasonality) that a simple threshold can't distinguish from an actual data-entry error.

---

## 48. Period Close Eligibility

**Purpose.** The hard gate preventing a month from closing while unresolved data-quality issues exist.

**Location.** `month-end-close.ts:91-93`, function `canClosePeriod()`.

**Formula.** `!exceptions.some(e => e.severity === 'blocking')` — true (closeable) only if zero blocking exceptions remain; informational exceptions never prevent closing.

**Output.** `boolean`.

**Dependencies.** Consumes §47's output directly. Feeds §50 (a calendar year can only close once every month in it is individually closed).

---

## 49. Annual P&L / Annual Cash Flow / Year-End Balance Sheet

**Purpose.** Calendar-year aggregation of the engine's already-correct monthly figures — explicitly **not** a new parallel calculation.

**Location.** `annual-close.ts:74-143`.

**Formula.**
- `computeAnnualPL`: sums `rev, cogs, gp, opex, ebitda, interest, nbt, tax, npat` across a year's month-index range (`slice(start, end+1).reduce(sum)`).
- `computeAnnualCashFlow`: sums `op_cash, fin_cash, inv_cash, net`; `openingCash = cf.open[startIdx]`; `closingCash = cf.close[endIdx]` (point-in-time, not summed).
- `computeYearEndBalanceSheet`: every field is simply `bs.field[endMonthIndex]` — a Balance Sheet is a point-in-time snapshot, never summed across a year the way P&L/Cash Flow are.

**Output.** `AnnualPL`, `AnnualCashFlow`, `YearEndBalanceSheet` — plain objects of currency figures, one instance per calendar year.

**Dependencies.** Purely an aggregation of §10–§21's monthly arrays; introduces no new computation.

---

## 50. Calendar-Year Close Eligibility

**Purpose.** A calendar year can only be formally closed once every month it actually contains is individually closed.

**Location.** `annual-close.ts:47-52`, function `canCloseCalendarYear()`.

**Formula.** `for each m in group.monthIndices: if !closedPeriods.has(periodForMonthIndex(startDate, m)): return false` — else `true`.

**Output.** `boolean`.

**Edge cases.** A calendar year's first or last block within the plan can legitimately be shorter than 12 months (e.g. a client starting to track in April has a genuine, closeable first "year" of only 9 months) — this is accepted, not rejected for being short of a full 12. A future or in-progress year is naturally excluded, since a month that hasn't happened yet can never be individually closed.

**Dependencies.** Gates the Year-End Close action; depends on §48 having been satisfied for every month in the year.

---

## 51. Automatic COGS from Catalogue Sale (Clearview Field)

**Purpose.** Auto-generates the matching cost-of-sales entry when a field-app sale is logged against a catalogue item with a known standard cost.

**Location.** `field-cogs.ts:36-56`, function `buildAutoCogsRow()`.

**Formula.** Returns `null` if `item.cost_price` is null/undefined or `item.cogs_plan_line_id` is unset — no COGS is ever fabricated for an item with no configured cost. Otherwise: `amount = quantity * item.cost_price` (per docs/ACCOUNTING_ARCHITECTURE.md §3 / IAS 2 / IFRS for SMEs §13: always the catalogue's **standard** cost price, never affected by any sale-side price override). `local_id = saleLocalId ? \`${saleLocalId}_cogs\` : null` — deterministic, so a retry of the same sale produces the same COGS `local_id`, preserving idempotency.

**Output.** `AutoCogsRow | null`: `{plan_line_id, plan_line_name, transaction_type: 'cogs_auto', category: 'cost_of_sales', amount, quantity, unit_price, catalogue_item_id, local_id}`.

**Edge cases.** `cost_price === 0` (exactly zero) is treated as a real, deliberately-set cost (e.g. a donated input) — NOT the same as "not set." Only `null`/`undefined` skips COGS generation.

**Dependencies.** Feeds Cost of Sales (§2) at the Clearview Field data-entry layer.

---

## 52. NOT BUILT: Fund Absorption Capacity

No implementation of a metric by this name (or anything semantically equivalent — how much additional capital a business could productively deploy) exists anywhere in the scoped codebase. Confirmed by repository-wide search (`Fund Absorption`, `FundAbsorption`, `fund_absorption` — zero matches). If this is wanted, it would need to be scoped and designed from scratch; no partial implementation to build on.

---

## 53. NOT BUILT: Seasonal Cash Position Projection

No implementation of a distinct "seasonal cash position" projection exists. **Do not confuse this with** the Debt Schedule's `seasonal` repayment type (§17), which lets a single loan's repayment fall on specific months (e.g. a harvest-cycle repayment schedule) — that is a real, built feature, but it is a debt-repayment-timing feature, not a projection of the business's overall cash position adjusted for seasonal revenue/cost patterns. Confirmed by repository-wide search — zero matches for a seasonal cash-position concept. The closest existing building block is the Cash Flow Statement (§19) itself, which is already inherently monthly and would reflect seasonality *if* the underlying plan lines were entered with seasonal variation — but there is no dedicated seasonal-adjustment or seasonal-projection calculation layered on top of it.
