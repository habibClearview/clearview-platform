// ============================================================
// A month nobody has planned is not a forecast of zero.
//
// 23 September 2026. Habib, looking at the live market intelligence page:
// "You keep saying you have done something when you have done nothing - i need
// to present this". Every business and the portfolio row showed revenue growth
// of −100% and debt cover of −60.7×.
//
// Both came from a model whose horizon had been extended to two years while
// only the first year had been filled in. The engine read the empty months as
// a forecast of no trading. This reproduces that model, proves the figures it
// produced, and proves they are gone once the model is run over the months it
// actually plans for.
// ============================================================
import { describe, it, expect } from 'vitest'
import { runGenericModel } from '@/lib/generic-engine'
import { revenueGrowthPctFromSeries, ebitdaMarginPct } from '@/lib/business-performance-metrics'
import { trimToPlannedMonths, lastPlannedMonthIndex } from '@/lib/plan-horizon'

/** A two-year horizon with only the first year filled in. */
function halfFilled(): any {
  return {
    client_id: 'p', business_name: 'P', currency: 'UGX', start_date: '2025-10-01', planning_months: 24,
    business_units: [{ id: 'u1', name: 'Trading', short: 'TR', type: 'product', color: '#000', headcount: 4, active: true, sort_order: 0 }],
    plan_lines: [
      { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: [...Array(12).fill(1000), ...Array(12).fill(0)], active: true },
      { id: 'cos1', unit_id: 'u1', name: 'Goods', category: 'cost_of_sales', line_type: 'standard', monthly_plan: [...Array(12).fill(600), ...Array(12).fill(0)], active: true },
      { id: 'ops1', unit_id: 'u1', name: 'Running costs', category: 'direct_opex', line_type: 'standard', monthly_plan: [...Array(12).fill(200), ...Array(12).fill(0)], active: true },
    ],
    shared_lines: [{ id: 'sh1', name: 'Admin', category: 'shared_opex', line_type: 'standard', monthly_plan: Array(24).fill(300), active: true }],
    settings: {
      shared_cost_fixed_pct: 50, corporate_tax_rate: 30, opening_cash_balance: 5000,
      capital_structure: { shareholder_contribution: 0, grant_recoverable: 12000, grant_recoverable_tenor_years: 2, grant_recoverable_grace_period_months: 0 },
    },
  }
}

describe('the figures the unfilled year produced', () => {
  it('reproduces −100% growth and a negative debt cover', () => {
    const r: any = runGenericModel(halfFilled())
    const rev: number[] = r.con.rev
    // Year one trades, year two is blank, and the old sum said −100%.
    expect(rev.slice(0, 12).reduce((a, b) => a + (b || 0), 0)).toBeGreaterThan(0)
    expect(rev.slice(12, 24).reduce((a, b) => a + (b || 0), 0)).toBe(0)
    expect(r.scores.hasDebt).toBe(true)
    expect(r.scores.dscrMin).toBeLessThan(0)
  })
})

describe('running the model over the months it plans for', () => {
  it('finds the last month the plan reaches', () => {
    // The shared admin line runs the full 24 months, and is ignored: a plan
    // reaches as far as its selling does, not as far as somebody filled a
    // cost line.
    expect(lastPlannedMonthIndex(halfFilled())).toBe(11)
    expect(trimToPlannedMonths(halfFilled()).planning_months).toBe(12)
  })

  it('stops the debt cover being read off months that were never planned', () => {
    const cfg = halfFilled()
    const before: any = runGenericModel(cfg)
    const after: any = runGenericModel(trimToPlannedMonths(cfg))

    // −30× before, because the worst month is one with a repayment due against
    // no revenue at all. Afterwards the figure describes a month the business
    // actually plans to trade in. It is still negative here, because these
    // made-up figures do lose money every month, and that is a real finding
    // rather than an artefact: what matters is that it is no longer two orders
    // of magnitude out.
    expect(before.scores.dscrMin).toBeLessThan(-10)
    expect(after.scores.dscrMin).toBeGreaterThan(before.scores.dscrMin)
    expect(Math.abs(after.scores.dscrMin)).toBeLessThan(Math.abs(before.scores.dscrMin) / 10)

    // Every month it now reads is a month inside the plan.
    expect(after.scores.dscrVals).toHaveLength(12)
    expect(after.con.rev.every((v: number) => v > 0)).toBe(true)
  })

  it('stops the margins being dragged down by a year of pure loss', () => {
    const cfg = halfFilled()
    const before: any = runGenericModel(cfg)
    const after: any = runGenericModel(trimToPlannedMonths(cfg))
    const mBefore = ebitdaMarginPct(before.metrics.total_ebitda, before.metrics.total_revenue)
    const mAfter = ebitdaMarginPct(after.metrics.total_ebitda, after.metrics.total_revenue)
    expect(mAfter!).toBeGreaterThan(mBefore!)
    expect(after.metrics.total_revenue).toBe(before.metrics.total_revenue)
  })

  it('never cuts a month the business has recorded actuals for', () => {
    const cfg = halfFilled()
    // Fifteen months of actuals against a plan that only reaches twelve.
    expect(trimToPlannedMonths(cfg, 15).planning_months).toBe(15)
  })

  it('leaves a fully planned model exactly as it was', () => {
    const cfg = halfFilled()
    cfg.plan_lines.forEach((l: any) => { l.monthly_plan = Array(24).fill(1000) })
    expect(trimToPlannedMonths(cfg)).toBe(cfg)
  })

  it('leaves an entirely empty plan alone rather than cutting it to nothing', () => {
    const cfg = halfFilled()
    cfg.plan_lines.forEach((l: any) => { l.monthly_plan = Array(24).fill(0) })
    expect(trimToPlannedMonths(cfg).planning_months).toBe(24)
  })
})

describe('revenue growth against a year nobody filled in', () => {
  it('gives no figure rather than −100%', () => {
    expect(revenueGrowthPctFromSeries([...Array(12).fill(1000), ...Array(12).fill(0)])).toBeNull()
  })

  it('still reports a real fall', () => {
    expect(revenueGrowthPctFromSeries([...Array(12).fill(1000), ...Array(12).fill(500)])).toBe(-50)
  })

  it('still reports real growth', () => {
    expect(revenueGrowthPctFromSeries([...Array(12).fill(1000), ...Array(12).fill(1500)])).toBe(50)
  })

  it('gives no figure when there was nothing to grow from', () => {
    expect(revenueGrowthPctFromSeries([...Array(12).fill(0), ...Array(12).fill(1000)])).toBeNull()
  })
})
