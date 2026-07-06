import { describe, it, expect } from 'vitest'
import { combinedActual as combined, computeActualsTotals as computeTotals, applyPeriodActual, buildHybridConsolidated, type ActualsPlanLine as PlanLine } from '../lib/actuals'

// Tests the real src/lib/actuals.ts functions -- the exact ones
// GenericDashboard.tsx's ActualsTab imports and uses, not a copy.
// Per docs/ACCOUNTING_ARCHITECTURE.md section 4: line_values (manual,
// accountant-entered) and field_line_values (written exclusively by
// aggregate_field_transactions()) must never overwrite each other --
// they're summed only at display/read time.

describe('Actuals — manual and field-derived figures combine without collision', () => {
  it('REG: a line with only a manual entry uses just that value', () => {
    expect(combined('line_a', { line_a: 5000 }, {})).toBe(5000)
  })

  it('REG: a line with only a field-derived entry uses just that value', () => {
    expect(combined('line_a', {}, { line_a: 8000 })).toBe(8000)
  })

  it('REG: a line with BOTH a manual entry and field data sums them -- this is the exact bug that was fixed', () => {
    // Before the fix, aggregate_field_transactions() overwrote line_values
    // directly, so a manual entry for the same line would be silently
    // erased by the next field sync. Now they live in separate columns
    // and are only ever summed for display.
    expect(combined('line_a', { line_a: 5000 }, { line_a: 8000 })).toBe(13000)
  })

  it('REG: a missing value on either side defaults to zero, not NaN or an error', () => {
    expect(combined('missing_line', {}, {})).toBe(0)
  })

  it('REG: values are read independently per line -- a value for one line never affects another', () => {
    const lineValues = { line_a: 100, line_b: 200 }
    const fieldLineValues = { line_a: 10 }
    expect(combined('line_a', lineValues, fieldLineValues)).toBe(110)
    expect(combined('line_b', lineValues, fieldLineValues)).toBe(200)
  })
})

describe('Actuals — Gross Profit is revenue minus cost of sales ONLY', () => {
  const lines: PlanLine[] = [
    { id: 'rev_1', category: 'revenue' },
    { id: 'cogs_1', category: 'cost_of_sales' },
    { id: 'staff_1', category: 'staff' },
    { id: 'opex_1', category: 'direct_opex' },
  ]

  it('REG: Gross Profit excludes staff and overheads -- this was the actual mislabeling bug found', () => {
    // Previously, "Gross Profit" was computed as revenue minus EVERY
    // non-revenue cost (cost_of_sales + staff + direct_opex combined),
    // which is not gross profit at all -- it's closer to net result.
    const lineValues = { rev_1: 1000, cogs_1: 300, staff_1: 200, opex_1: 100 }
    const totals = computeTotals(lines, lineValues, {})
    expect(totals.grossProfit).toBe(700) // 1000 - 300 (COGS only)
    expect(totals.grossProfit).not.toBe(400) // the old, wrong calculation (1000 - 300 - 200 - 100)
  })

  it('REG: Net Result (separate from Gross Profit) does subtract all costs', () => {
    const lineValues = { rev_1: 1000, cogs_1: 300, staff_1: 200, opex_1: 100 }
    const totals = computeTotals(lines, lineValues, {})
    expect(totals.netResult).toBe(400) // 1000 - 300 - 200 - 100
    expect(totals.totalCost).toBe(600)
  })

  it('REG: with zero cost_of_sales recorded, Gross Profit equals full revenue -- correctly reflects nothing was captured, not a fabricated margin', () => {
    const lineValues = { rev_1: 1000, staff_1: 200, opex_1: 100 }
    const totals = computeTotals(lines, lineValues, {})
    expect(totals.grossProfit).toBe(1000)
    expect(totals.netResult).toBe(700)
  })

  it('REG: Gross Profit correctly combines manual and field-sourced revenue and COGS together', () => {
    const lineValues = { rev_1: 500, cogs_1: 150 }
    const fieldLineValues = { rev_1: 500, cogs_1: 150 }
    const totals = computeTotals(lines, lineValues, fieldLineValues)
    expect(totals.totalRev).toBe(1000)
    expect(totals.totalCOGS).toBe(300)
    expect(totals.grossProfit).toBe(700)
  })
})

describe('applyPeriodActual — one decision per period, never a per-line blend', () => {
  it('REG: when the period is actual, uses the actual value even if it differs wildly from plan', () => {
    const plan = [100, 200, 300]
    const actual = [90, null, 310]
    const periodIsActual = [true, false, true]
    expect(applyPeriodActual(plan, actual, periodIsActual)).toEqual([90, 200, 310])
  })

  it('REG: when the period is NOT actual, uses the planned value even if an actual figure happens to exist for that month', () => {
    // This is the exact case that matters: a row might have SOME actual
    // data available on its own, but if the period overall isn't
    // complete, it must not leak through -- the whole column shows plan
    // together, never a partial blend.
    const plan = [100, 200, 300]
    const actual = [999, 999, 999] // present, but period says not complete
    const periodIsActual = [false, false, false]
    expect(applyPeriodActual(plan, actual, periodIsActual)).toEqual([100, 200, 300])
  })

  it('REG: every row given the SAME periodIsActual mask produces a fully consistent period -- never revenue actual while cost stays planned', () => {
    // Directly modeling the reported bug: Revenue and Cost of Sales must
    // switch together, in the same months, because they share one mask.
    const periodIsActual = [true, false, true]
    const revenueDisplayed = applyPeriodActual([1000, 1000, 1000], [1200, null, 900], periodIsActual)
    const costDisplayed    = applyPeriodActual([400, 400, 400], [380, null, 410], periodIsActual)
    // Month 0 and 2: both actual. Month 1: both planned. Never mixed.
    expect(revenueDisplayed[0]).toBe(1200); expect(costDisplayed[0]).toBe(380) // both actual
    expect(revenueDisplayed[1]).toBe(1000); expect(costDisplayed[1]).toBe(400) // both planned
    expect(revenueDisplayed[2]).toBe(900);  expect(costDisplayed[2]).toBe(410) // both actual
  })

  it('REG: when the period is actual but this series has no actual figure for that month, does not silently emit null', () => {
    const plan = [100, 200, 300]
    const actual = [90, null, null] // actual for month 2 is missing despite the period being "actual"
    const periodIsActual = [true, false, true]
    expect(applyPeriodActual(plan, actual, periodIsActual)).toEqual([90, 200, 300])
  })

  it('REG: the exact composition bug found live -- calling applyPeriodActual with a RAW nullable array (no ?? 0 first) falls back to PLAN for that one row, even while a sibling row correctly shows the actual-derived zero', () => {
    // This models Revenue vs Gross Profit for a unit that has genuinely
    // recorded nothing this month. GP is computed by the engine with
    // ?? 0 already baked in (never null for a past/current period), but
    // the raw act_rev is still null when nothing was entered -- passing
    // it to applyPeriodActual WITHOUT mapping null -> 0 first falls back
    // to the planned revenue, while GP (already zero-safe) correctly
    // shows zero. Same period, two different sources -- the bug.
    const periodIsActual = [true]
    const planRev = [1_000_000]
    const rawActRev: (number | null)[] = [null] // nothing entered this month
    const gp = [0] // the engine's own actual-derived GP for this month (zero)

    const buggyRevValues = applyPeriodActual(planRev, rawActRev, periodIsActual)
    expect(buggyRevValues[0]).toBe(1_000_000) // WRONG if this were shipped: falls back to plan
    expect(buggyRevValues[0]).not.toBe(gp[0]) // proves the mismatch: Revenue (plan) vs GP (actual zero)

    // The fix: map null -> 0 before calling, so Revenue and GP always
    // share the same source for the same period.
    const fixedRevValues = applyPeriodActual(planRev, rawActRev.map(v => v ?? 0), periodIsActual)
    expect(fixedRevValues[0]).toBe(0)
    expect(fixedRevValues[0]).toBe(gp[0]) // now consistent with GP
  })
})

describe('buildHybridConsolidated — single source of truth for the P&L and Annual tabs', () => {
  it('REG: Revenue uses the real actual figure even when Cost of Sales was not entered this month -- never falls back to the planned Revenue', () => {
    const con = {
      rev: [1_000_000], cogs: [400_000], gp: [600_000], opex: [100_000], ebitda: [500_000], interest: [0],
      nbt: [500_000], tax: [150_000], npat: [350_000],
      act_rev: [900_000] as (number | null)[], act_cogs: [null] as (number | null)[], // cost not entered this month
      act_gp: [900_000] as (number | null)[], act_ebitda: [800_000] as (number | null)[],
      act_nbt: [800_000] as (number | null)[], act_tax: [240_000] as (number | null)[], act_npat: [560_000] as (number | null)[],
    }
    const hybrid = buildHybridConsolidated(con)
    expect(hybrid.periodIsActual[0]).toBe(true)
    expect(hybrid.rev[0]).toBe(900_000)
    // Cost of Sales, unreported, is treated as zero (not the planned 400,000)
    expect(hybrid.cogs[0]).toBe(0)
  })

  it('REG: a future month (act_ebitda null) uses the planned figures for every field, consistently', () => {
    const con = {
      rev: [1_000_000], cogs: [400_000], gp: [600_000], opex: [100_000], ebitda: [500_000], interest: [0],
      nbt: [500_000], tax: [150_000], npat: [350_000],
      act_rev: [null] as (number | null)[], act_cogs: [null] as (number | null)[],
      act_gp: [null] as (number | null)[], act_ebitda: [null] as (number | null)[],
      act_nbt: [null] as (number | null)[], act_tax: [null] as (number | null)[], act_npat: [null] as (number | null)[],
    }
    const hybrid = buildHybridConsolidated(con)
    expect(hybrid.periodIsActual[0]).toBe(false)
    expect(hybrid.rev[0]).toBe(1_000_000)
    expect(hybrid.gp[0]).toBe(600_000)
    expect(hybrid.npat[0]).toBe(350_000)
  })
})
