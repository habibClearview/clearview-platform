// ============================================================
// The board must show numbers when a business has recorded months.
//
// 23 September 2026. The first version of the market intelligence board
// shipped showing a page of dashes and "n<5" for every measure. Two faults
// caused it: the portfolio loader ran each client's model with no actuals at
// all, so there were no recorded months to read; and a suppression rule meant
// for a shared anonymised view blanked any figure drawn from fewer than five
// businesses, on a page where a coach looks at their own three.
//
// This runs the real engine the way the loader now runs it and asserts the
// board comes out with figures rather than dashes. It prints them too, so a
// failure shows what actually appeared rather than only that a count was wrong.
// ============================================================
import { describe, it, expect } from 'vitest'
import { runGenericModel } from '@/lib/generic-engine'
import { periodForMonthIndex } from '@/lib/month-end-close'
import { clientMonthsFrom, aggregateMonthly, monthsAcross, reportingCurrency } from '@/lib/portfolio-monthly'

const config: any = {
  client_id: 'proof', business_name: 'Proof Ltd', currency: 'UGX',
  start_date: '2026-01-01', planning_months: 12,
  business_units: [{ id: 'u1', name: 'Trading', short: 'TR', type: 'product', color: '#000', headcount: 4, active: true, sort_order: 0 }],
  plan_lines: [
    { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(1000), active: true },
    { id: 'cos1', unit_id: 'u1', name: 'Goods', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(600), active: true },
    { id: 'ops1', unit_id: 'u1', name: 'Running costs', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(200), active: true },
  ],
  shared_lines: [],
  settings: { shared_cost_fixed_pct: 50, corporate_tax_rate: 30, opening_cash_balance: 5000 },
}

// Four months of real figures, as generic_actuals would hold them.
const actuals = {
  u1: {
    '2026-01-01': { rev1: 900, cos1: 560, ops1: 190 },
    '2026-02-01': { rev1: 1050, cos1: 640, ops1: 200 },
    '2026-03-01': { rev1: 1180, cos1: 700, ops1: 210 },
    '2026-04-01': { rev1: 1240, cos1: 720, ops1: 215 },
  },
}

describe('the board shows figures, not dashes', () => {
  it('produces real numbers for the months a business has recorded', () => {
    const result: any = runGenericModel(config, actuals)
    const months = clientMonthsFrom(result.con, (i) => periodForMonthIndex(config.start_date, i))

    const clients = [{ clientId: 'proof', currency: 'UGX', months }]
    const keys = monthsAcross(clients)
    const points = aggregateMonthly(clients, keys, reportingCurrency(clients))

    // eslint-disable-next-line no-console
    console.log('\n  BOARD WOULD SHOW:')
    points.forEach((p) => {
      // eslint-disable-next-line no-console
      console.log(`    ${p.label}  revenue ${p.revenue}  gross ${p.grossMargin?.toFixed(1)}%  operating ${p.ebitdaMargin?.toFixed(1)}%  (n=${p.n})`)
    })

    expect(months.length).toBe(4)
    expect(points.every((p) => p.revenue !== null)).toBe(true)
    expect(points.every((p) => p.grossMargin !== null)).toBe(true)
    expect(points[0].revenue).toBe(900)
    expect(points[3].revenue).toBe(1240)
  })

  it('shows nothing only when a business genuinely has no actuals', () => {
    const result: any = runGenericModel(config)
    const months = clientMonthsFrom(result.con, (i) => periodForMonthIndex(config.start_date, i))
    expect(months).toHaveLength(0)
  })
})
