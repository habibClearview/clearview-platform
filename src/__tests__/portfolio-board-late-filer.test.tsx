// ============================================================
// A business behind on its bookkeeping must not read as a collapse.
//
// 23 September 2026. The board adds up what every business sold each month.
// Where one business has not yet closed the latest month, its sales are not in
// that month's total, and a straight comparison of the first month against the
// last showed the portfolio falling by roughly the size of the missing
// business. On a page sold to programme directors and lenders, a verdict of
// FALLING BACK caused by late bookkeeping is worse than no page at all.
//
// So the comparison is like for like: same businesses in both months. This
// renders the real component with three businesses, one of which stopped
// filing two months early, and reads the rendered markup rather than trusting
// that the maths was wired to the screen.
// ============================================================
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runGenericModel } from '@/lib/generic-engine'
import { periodForMonthIndex } from '@/lib/month-end-close'
import {
  clientMonthsFrom, aggregateMonthly, monthsAcross, reportingCurrency, likeForLikeRevenue,
} from '@/lib/portfolio-monthly'
import PortfolioBoard from '@/components/coach/PortfolioBoard'

const START = '2025-10-01'

function business(name: string, scale: number, monthsRecorded: number) {
  const config: any = {
    client_id: name, business_name: name, currency: 'UGX',
    start_date: START, planning_months: 24,
    business_units: [{ id: 'u1', name: 'Trading', short: 'TR', type: 'product', color: '#000', headcount: 4, active: true, sort_order: 0 }],
    plan_lines: [
      { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(24).fill(scale * 1000), active: true },
      { id: 'cos1', unit_id: 'u1', name: 'Goods', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(24).fill(scale * 600), active: true },
      { id: 'ops1', unit_id: 'u1', name: 'Running costs', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(24).fill(scale * 200), active: true },
    ],
    shared_lines: [],
    settings: { shared_cost_fixed_pct: 50, corporate_tax_rate: 30, opening_cash_balance: 5000 },
  }
  const actuals: any = { u1: {} }
  for (let i = 0; i < monthsRecorded; i++) {
    actuals.u1[periodForMonthIndex(START, i)] = {
      rev1: scale * (900 + i * 55), cos1: scale * (560 + i * 26), ops1: scale * (190 + i * 6),
    }
  }
  const result: any = runGenericModel(config, actuals)
  return {
    clientId: name, currency: 'UGX',
    months: clientMonthsFrom(result.con, (i) => periodForMonthIndex(START, i)),
  }
}

function board(clients: ReturnType<typeof business>[]) {
  const months = monthsAcross(clients)
  const currency = reportingCurrency(clients)
  const monthly = {
    months,
    points: aggregateMonthly(clients, months, currency),
    currency,
    currencies: ['UGX'],
    businesses: clients.length,
    lfl: likeForLikeRevenue(clients, months, currency),
  }
  const html = renderToStaticMarkup(React.createElement(PortfolioBoard, {
    view: 'portfolio',
    monthly,
    current: { readiness: 18, marketReady: 1, verified: null, dscr: 1.4, confidence: 62 },
    businesses: clients.length,
    fallbackCurrency: 'UGX',
  } as any))
  return { monthly, html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

describe('a business behind on its bookkeeping', () => {
  it('does not turn a growing portfolio into a falling one', () => {
    // Two businesses have eleven months. The third stopped at nine, so the
    // last two months of the portfolio total are missing its sales.
    const { monthly, text } = board([business('A', 1, 11), business('B', 3, 9), business('C', 2, 11)])

    // The raw total genuinely dips, and the page must still show that honestly.
    const raw = monthly.points.map((p) => p.revenue as number)
    expect(raw[raw.length - 1]).toBeLessThan(raw[raw.length - 3])

    // But the verdict is measured on the businesses present in both months.
    expect(monthly.lfl).not.toBeNull()
    expect(monthly.lfl!.restricted).toBe(true)
    expect(monthly.lfl!.businesses).toBe(2)
    expect(monthly.lfl!.diff!).toBeGreaterThan(0)

    expect(text).toContain('like for like')
    expect(text).not.toContain('FALLING BACK')
  })

  it('counts who reported, month by month, so any dip explains itself', () => {
    const { monthly, text } = board([business('A', 1, 11), business('B', 3, 9), business('C', 2, 11)])
    expect(monthly.points[0].n).toBe(3)
    expect(monthly.points[monthly.points.length - 1].n).toBe(2)
    expect(text).toContain('Businesses reporting')
  })

  it('says nothing was restricted when everybody reported', () => {
    const { monthly, text } = board([business('A', 1, 11), business('C', 2, 11)])
    expect(monthly.lfl!.restricted).toBe(false)
    expect(monthly.lfl!.businesses).toBe(2)
    expect(text).not.toContain('like for like')
  })

  it('shows figures rather than a page of dashes', () => {
    const { text } = board([business('A', 1, 11), business('C', 2, 11)])
    expect(text).not.toContain('n<5')
    expect(text).toContain('Combined revenue')
    expect(text).toMatch(/\d/)
  })
})

// ============================================================
// The month-by-month block must not leave the coach's own login.
//
// It carries combined revenue for each calendar month. A segment grant can be
// narrow enough to hold one business, and that business's monthly sales would
// then be readable by whoever holds the link. Nothing on the public page draws
// it, so it is withheld at the route.
// ============================================================
import fs from 'fs'
import path from 'path'

describe('the external access route', () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/access-grant/[token]/route.ts'), 'utf8',
  )

  it('strips the month-by-month block before answering a token holder', () => {
    expect(route).toContain('const { monthly: _withheld, ...shared } = data')
    expect(route).toContain('data: shared')
  })

  it('never answers a token holder with the whole view object', () => {
    expect(route).not.toMatch(/viewAvailable:\s*true,\s*scopeDescription,\s*data\s*\}/)
  })
})
