// Shared logic for combining manually-entered and field-app-derived
// actuals. Per docs/ACCOUNTING_ARCHITECTURE.md section 4: generic_actuals
// keeps these in separate columns (line_values = manual, field_line_values
// = written exclusively by aggregate_field_transactions()) so neither
// writer can ever overwrite the other. They're summed together only here,
// at read time.
//
// Extracted into its own module (rather than defined inline in
// GenericDashboard.tsx) so tests exercise the exact function the
// dashboard uses, not a separate copy that can silently drift out of sync.

export interface ActualsPlanLine {
  id: string
  category: string
}

export function combinedActual(
  lineId: string,
  lineValues: Record<string, number>,
  fieldLineValues: Record<string, number>
): number {
  return Number(lineValues[lineId] || 0) + Number(fieldLineValues[lineId] || 0)
}

export interface ActualsTotals {
  totalRev: number
  totalCOGS: number
  totalOtherCosts: number
  totalCost: number
  // True Gross Profit: revenue less cost of sales ONLY -- staff and
  // overheads are real costs but are not part of gross profit. Computing
  // this as revenue minus every non-revenue cost was an actively
  // misleading bug, not a naming nitpick -- see architecture doc.
  grossProfit: number
  netResult: number
}

export function computeActualsTotals(
  lines: ActualsPlanLine[],
  lineValues: Record<string, number>,
  fieldLineValues: Record<string, number>
): ActualsTotals {
  const c = (id: string) => combinedActual(id, lineValues, fieldLineValues)
  const totalRev = lines.filter(l => l.category === 'revenue').reduce((s, l) => s + c(l.id), 0)
  const totalCOGS = lines.filter(l => l.category === 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalOtherCosts = lines.filter(l => l.category !== 'revenue' && l.category !== 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalCost = totalCOGS + totalOtherCosts
  const grossProfit = totalRev - totalCOGS
  const netResult = totalRev - totalCost
  return { totalRev, totalCOGS, totalOtherCosts, totalCost, grossProfit, netResult }
}

// Used by the Consolidated P&L's Total Operating Costs row. Must derive
// from the actual Gross Profit figure, not a hybrid/plan-blended one --
// deriving via actGrossProfit - actEbitda (both already correctly treat
// a category with zero plan lines anywhere as zero, not "missing") means
// this always reconciles exactly by construction: GP - Operating Costs
// = EBITDA, with no separate category-presence check of its own that
// could drift out of sync with the engine's.
export function deriveActualOperatingCosts(actGrossProfit: number, actEbitda: number | null): number | null {
  return actEbitda !== null ? actGrossProfit - actEbitda : null
}

// Used by both the by-unit and Consolidated P&L views. A period (month)
// is either ENTIRELY actual or ENTIRELY plan -- never a blend of some
// rows actual and others plan within the same column. That blend is not
// a real accounting practice (Budget vs Actual compares two full,
// separate figures side by side; it never merges them into one number
// per line) and reads as broken even when each individual figure is
// technically correct. periodIsActual is computed once per month
// (typically from whether act_ebitda is non-null, since that only
// computes once every category with real data requirements is complete)
// and applied uniformly here.
export function applyPeriodActual(planValues: number[], actualValues: (number | null)[], periodIsActual: boolean[]): number[] {
  return planValues.map((v, m) => (periodIsActual[m] && actualValues[m] !== null) ? (actualValues[m] as number) : v)
}

// Builds the consolidated P&L as one consistent set of hybrid (actual-
// or-plan, per the calendar rule) arrays -- Revenue, Cost of Sales, GP,
// Operating Costs, EBITDA, NBT, Tax, NPAT. Used by both the P&L tab's
// Consolidated view and the Annual tab, so the calendar-rule/opex-
// derivation pattern lives in exactly one place rather than being
// copied at each call site, where one copy could silently drift from
// the other (which is exactly how the Annual tab ended up summing pure
// planned figures while the P&L tab correctly summed hybrid ones).
export function buildHybridConsolidated(con: {
  rev: number[]; cogs: number[]; gp: number[]; opex: number[]; ebitda: number[]; interest: number[];
  depreciation?: number[]; ebit?: number[];
  nbt: number[]; tax: number[]; npat: number[];
  hybrid_nbt?: number[]; hybrid_tax?: number[]; hybrid_npat?: number[];
  act_rev: (number | null)[]; act_cogs: (number | null)[]; act_gp: (number | null)[]; act_ebitda: (number | null)[];
  act_nbt: (number | null)[]; act_tax: (number | null)[]; act_npat: (number | null)[];
}) {
  // periodIsActual requires BOTH act_ebitda AND act_gp non-null, not just
  // act_ebitda. Under the current engine these are always set together
  // (act_ebitda is computed FROM act_gp in the same conditional), so in
  // practice this is identical to checking act_ebitda alone. But if that
  // pairing were ever violated by a future engine change -- act_gp null
  // while act_ebitda somehow isn't -- checking only act_ebitda would let
  // gp fall back to plan (via applyPeriodActual's own null-check) while
  // ebitda still showed the actual figure, in the very same period: the
  // exact "some rows actual, some plan, same column" bug this function
  // exists to prevent, just triggered by an anomalous input instead of a
  // normal one. Requiring both means a violated invariant makes the
  // WHOLE period consistently fall back to plan, never a partial mix.
  const periodIsActual: boolean[] = con.act_ebitda.map((v, m) => v !== null && con.act_gp[m] !== null)
  const actOpexTotal = con.act_ebitda.map((eb, m) => con.act_gp[m] !== null ? deriveActualOperatingCosts(con.act_gp[m] as number, eb) : null)
  const ebitdaValues = applyPeriodActual(con.ebitda, con.act_ebitda, periodIsActual)
  const depreciationValues = con.depreciation ?? con.ebitda.map(() => 0)
  return {
    periodIsActual,
    rev: applyPeriodActual(con.rev, con.act_rev.map(v => v ?? 0), periodIsActual),
    cogs: applyPeriodActual(con.cogs, con.act_cogs.map(v => v ?? 0), periodIsActual),
    gp: applyPeriodActual(con.gp, con.act_gp, periodIsActual),
    opex: applyPeriodActual(con.opex, actOpexTotal, periodIsActual),
    ebitda: ebitdaValues,
    depreciation: depreciationValues,
    // Depreciation is a fixed schedule, not itself a plan-vs-actual
    // figure (same treatment as interest) -- EBIT is simply hybrid EBITDA
    // less that schedule, for whichever month is being shown.
    ebit: con.ebit ?? ebitdaValues.map((e, m) => e - depreciationValues[m]),
    interest: con.interest,
    // NBT/Tax/NPAT read the engine's own hybrid_* arrays directly rather
    // than re-deriving via applyPeriodActual(con.nbt, con.act_nbt, ...) --
    // that per-field substitution falls back to the PURE PLAN figure for
    // any future month, even one inside a fiscal year that already has
    // real actuals earlier in it, silently ignoring the real year-to-date
    // tax position those actuals produced (see applyCorporateTax in
    // generic-engine.ts). hybrid_nbt/tax/npat already carry that forward
    // correctly for every month, actual or still-forecast, so this is the
    // one true figure Cash Flow, the Balance Sheet, and this P&L display
    // must all agree on.
    nbt: con.hybrid_nbt ?? applyPeriodActual(con.nbt, con.act_nbt, periodIsActual),
    tax: con.hybrid_tax ?? applyPeriodActual(con.tax, con.act_tax, periodIsActual),
    npat: con.hybrid_npat ?? applyPeriodActual(con.npat, con.act_npat, periodIsActual),
  }
}

// Computes a plan line's total from catalogue-priced manual entry:
// quantity x price, summed across every catalogue item mapped to that
// line. This is the "default" entry path for a line that has catalogue
// items configured -- a round-figure entry remains available as an
// explicit per-line fallback for paper-only outlets, entirely separate
// from this calculation.
export function computeCatalogueLineTotal(
  items: {id: string; price: number}[],
  quantities: Record<string, number>,
): number {
  return items.reduce((sum, item) => sum + (Number(quantities[item.id]) || 0) * Number(item.price || 0), 0)
}
