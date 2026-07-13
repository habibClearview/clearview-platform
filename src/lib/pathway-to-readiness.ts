// Pathway to Readiness (Product Development Specification §6.1, Report
// Type 2): a plain-language action plan built from the gap between a
// business's current Liquidity Readiness dimension scores and full
// closure of that gap. Names the three most impactful improvements, the
// score gain each would produce, the concrete actions that would produce
// it, and -- only when the business's own history actually supports it
// -- a real, trend-based estimate of how long it would take.
//
// The timing estimate is deliberately conservative about what it claims:
// it extrapolates from the business's OWN historical dimension scores
// (the same monthly Liquidity Readiness series already computed for the
// trend chart), never a generic industry assumption. With fewer than 3
// real historical points, or a flat/declining trend, it says so plainly
// instead of manufacturing a number -- the same "insufficient data, not
// a fabricated positive story" discipline used throughout
// seasonal-cash-projection.ts and fund-absorption-capacity.ts.

import type { LRSResult } from './liquidity-readiness'

export type LRSDimensionKey = keyof LRSResult['dimensions']

const LRS_DIMENSION_KEYS: LRSDimensionKey[] = [
  'marketOpportunity', 'visibility', 'trust', 'profitability', 'capacity', 'resilience', 'compliance',
]

// Concrete, indicator-grounded actions -- each one traces to a real
// indicator formula in liquidity-readiness.ts, not generic advice.
const DIMENSION_ACTIONS: Record<LRSDimensionKey, string[]> = {
  marketOpportunity: [
    'Grow revenue for 3+ consecutive months -- this directly raises the Revenue Growth indicator.',
    'Improve gross margin toward 40% -- raises the Gross Margin indicator.',
    'Record new customers acquired through the marketing/CRM log.',
    'Update the Business Profile assessment with current commercial model clarity and market evidence.',
  ],
  visibility: [
    'Connect mobile money verification (Verification & Recognition panel) so more revenue is independently confirmed.',
    'Enter actuals for every month, not just some -- raises Financial Statements Complete.',
    'Formally close each period once entered -- raises Business Records Complete.',
    'Keep using Clearview Field for transactions -- raises Transactions Digitally Captured.',
  ],
  trust: [
    'Pay suppliers faster (lower Days Payable Outstanding) -- directly raises Payment Behaviour.',
    'Keep documented, consistent transaction records -- raises Data Consistency.',
    'Update the Business Profile with current supplier relationships, audit trail, and governance standing.',
  ],
  profitability: [
    'Improve EBITDA margin toward 30% of revenue.',
    'Keep monthly cash flow positive -- avoid cash-negative months.',
    'Grow revenue toward (and past) the calculated break-even point.',
  ],
  capacity: [
    'Build cash runway to 3+ months of the latest month\'s operating costs.',
    'Improve revenue per head (staff efficiency).',
    'Update the Business Profile with current production capacity, management systems, and inventory availability.',
  ],
  resilience: [
    'Build cash reserve to 6+ months of the latest month\'s operating costs.',
    'Reduce debt relative to equity, or confirm strong debt service coverage (DSCR) if debt exists.',
    'Update the Business Profile with customer/supplier diversification and a business continuity plan.',
  ],
  compliance: [
    'Complete business registration if not already done.',
    'Stay current on tax obligations and required licences.',
    'Formally close every period on time -- raises Financial Reporting.',
    'Update the Business Profile with current governance/policy standing.',
  ],
}

export interface DimensionHistoryPoint {
  monthIndex: number
  score: number  // that dimension's score, 0-100, for a REAL (actual) month only
}

export type PathwayTiming =
  | { status: 'insufficient_history' }
  | { status: 'no_improving_trend' }
  | { status: 'projected'; monthlyRate: number; monthsToClose: number; exceedsHorizon: boolean }

export interface PathwayOpportunity {
  dimension: LRSDimensionKey
  currentScore: number
  potentialLift: number  // LRS-score points gained, portfolio-scale (0-100), if this dimension's gap were fully closed
  actions: string[]
  timing: PathwayTiming
}

const MIN_HISTORY_POINTS = 3
const TIMING_HORIZON_MONTHS = 36

// Ordinary least-squares slope of score against time index -- points of
// score gained per month, using only the real historical points given.
function trendSlope(points: DimensionHistoryPoint[]): number {
  const n = points.length
  const xBar = points.reduce((s, p) => s + p.monthIndex, 0) / n
  const yBar = points.reduce((s, p) => s + p.score, 0) / n
  const num = points.reduce((s, p) => s + (p.monthIndex - xBar) * (p.score - yBar), 0)
  const den = points.reduce((s, p) => s + (p.monthIndex - xBar) ** 2, 0)
  return den > 0 ? num / den : 0
}

function computeTiming(currentScore: number, history: DimensionHistoryPoint[]): PathwayTiming {
  if (history.length < MIN_HISTORY_POINTS) return { status: 'insufficient_history' }
  const slope = trendSlope(history)
  if (slope <= 0) return { status: 'no_improving_trend' }
  const gap = 100 - currentScore
  const rawMonths = gap / slope
  const monthsToClose = Math.min(TIMING_HORIZON_MONTHS, Math.ceil(rawMonths))
  return { status: 'projected', monthlyRate: slope, monthsToClose, exceedsHorizon: rawMonths > TIMING_HORIZON_MONTHS }
}

export function computePathwayToReadiness(
  currentLRS: LRSResult,
  weights: Record<LRSDimensionKey, number>,
  dimensionHistory: Partial<Record<LRSDimensionKey, DimensionHistoryPoint[]>>,
  topN = 3,
): PathwayOpportunity[] {
  const opportunities: PathwayOpportunity[] = LRS_DIMENSION_KEYS.map(dimension => {
    const currentScore = currentLRS.dimensions[dimension].score
    const gap = 100 - currentScore
    const potentialLift = gap * (weights[dimension] ?? 0)
    const history = dimensionHistory[dimension] ?? []
    return {
      dimension, currentScore, potentialLift,
      actions: DIMENSION_ACTIONS[dimension],
      timing: computeTiming(currentScore, history),
    }
  })

  return opportunities
    .sort((a, b) => b.potentialLift - a.potentialLift)
    .slice(0, topN)
}
