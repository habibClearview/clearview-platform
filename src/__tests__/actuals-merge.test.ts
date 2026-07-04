import { describe, it, expect } from 'vitest'

// Re-implements the pure combine/aggregate logic from ActualsTab in
// GenericDashboard.tsx for testing without a full component render.
// Per docs/ACCOUNTING_ARCHITECTURE.md section 4: line_values (manual,
// accountant-entered) and field_line_values (written exclusively by
// aggregate_field_transactions()) must never overwrite each other --
// they're summed only at display/read time.

interface PlanLine { id: string; category: string }

function combined(lineId: string, lineValues: Record<string, number>, fieldLineValues: Record<string, number>): number {
  return Number(lineValues[lineId] || 0) + Number(fieldLineValues[lineId] || 0)
}

function computeTotals(lines: PlanLine[], lineValues: Record<string, number>, fieldLineValues: Record<string, number>) {
  const c = (id: string) => combined(id, lineValues, fieldLineValues)
  const totalRev = lines.filter(l => l.category === 'revenue').reduce((s, l) => s + c(l.id), 0)
  const totalCOGS = lines.filter(l => l.category === 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalOtherCosts = lines.filter(l => l.category !== 'revenue' && l.category !== 'cost_of_sales').reduce((s, l) => s + c(l.id), 0)
  const totalCost = totalCOGS + totalOtherCosts
  const grossProfit = totalRev - totalCOGS
  const netResult = totalRev - totalCost
  return { totalRev, totalCOGS, totalOtherCosts, totalCost, grossProfit, netResult }
}

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
