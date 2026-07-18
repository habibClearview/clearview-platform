// ============================================================
// MARKET ACTIVITIES (marketing events) — pure planning logic.
//
// A market activity is a forward-planned marketing/sales push with a cost, a
// target business unit, a start month, a duration, and an expected sales uplift.
// Once APPROVED, its cost must flow into the financial model. The engine
// (src/lib/generic-engine.ts) sums every active plan line into its P&L category
// bucket purely by `category`, so the cleanest, lowest-risk way to make an
// approved event's cost flow into P&L / cash flow / balance sheet is to turn it
// into a synthetic plan line and add it to config.plan_lines before running the
// model. That is exactly what syntheticPlanLinesFromEvents does.
//
// Pure functions only — no React, no database — so the money-affecting logic is
// unit-tested in isolation.
// ============================================================

import { monthIndexForPeriod } from './month-end-close'
import type { GenericPlanLine } from './generic-engine'

export type MarketEventStatus = 'proposed' | 'approved' | 'rejected'
export type MarketEventCostCategory = 'direct_opex' | 'cost_of_sales'

// Mirrors the generic_market_events table columns.
export interface MarketEvent {
  id: string
  client_id: string
  unit_id: string | null          // target business unit; null = whole business
  name: string
  description?: string | null
  cost: number                    // total cost of the activity
  start_period: string            // 'YYYY-MM-01' — first month it applies
  months_count: number            // spread the cost evenly across this many months (>=1)
  cost_category: MarketEventCostCategory
  expected_uplift_pct?: number | null
  status: MarketEventStatus
  approved_by?: string | null
  approved_at?: string | null
  review_note?: string | null
  created_by?: string | null
  created_at?: string | null
}

// Prefix that marks a plan line as event-derived, so the engine-injection can
// be recognised (and never persisted back into the real plan by mistake).
export const MARKET_EVENT_LINE_PREFIX = 'mktevt_'

export function isMarketEventLineId(lineId: string | undefined | null): boolean {
  return typeof lineId === 'string' && lineId.startsWith(MARKET_EVENT_LINE_PREFIX)
}

/**
 * Turn approved market events into synthetic plan lines to concat into
 * config.plan_lines before running the engine.
 *
 * Rules (deliberately strict so nothing surprising hits the P&L):
 *  - Only status === 'approved' events produce a line.
 *  - The event must target a business unit (unit_id) and have a positive cost.
 *  - The cost is spread evenly across `months_count` months starting at
 *    `start_period`. Any month that falls outside the planning window
 *    [0, planningMonths) is dropped (its share of the cost is not shown), so an
 *    event partly or wholly outside the horizon never overflows the arrays.
 *  - Every returned line has a monthly_plan of exactly planningMonths entries,
 *    which the engine and extendPlanningHorizon both require.
 */
export function syntheticPlanLinesFromEvents(
  events: MarketEvent[],
  startDate: string,
  planningMonths: number,
): GenericPlanLine[] {
  const lines: GenericPlanLine[] = []
  if (!Array.isArray(events) || planningMonths <= 0) return lines

  for (const e of events) {
    if (!e || e.status !== 'approved') continue
    if (!e.unit_id) continue
    const cost = Number(e.cost)
    if (!(cost > 0)) continue

    const n = Math.max(1, Math.floor(Number(e.months_count) || 1))
    const perMonth = cost / n
    const startIdx = monthIndexForPeriod(startDate, e.start_period)

    const monthly = new Array(planningMonths).fill(0)
    let placedAny = false
    for (let k = 0; k < n; k++) {
      const idx = startIdx + k
      if (idx >= 0 && idx < planningMonths) {
        monthly[idx] += perMonth
        placedAny = true
      }
    }
    if (!placedAny) continue // entirely outside the planning window

    lines.push({
      id: `${MARKET_EVENT_LINE_PREFIX}${e.id}`,
      unit_id: e.unit_id,
      name: `Market activity: ${e.name}`,
      category: e.cost_category === 'cost_of_sales' ? 'cost_of_sales' : 'direct_opex',
      line_type: 'standard',
      monthly_plan: monthly,
      active: true,
    } as GenericPlanLine)
  }
  return lines
}
