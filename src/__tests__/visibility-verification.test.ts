import { describe, it, expect } from 'vitest'
import { computeVisibility, type LRSInputs } from '../lib/liquidity-readiness'
import { defaultCoachAssessment } from '../lib/scoring-engine'

function inputs(over: Partial<LRSInputs> = {}): LRSInputs {
  return {
    annualRevenue: 24_000_000, annualEbitda: 4_800_000, annualGrossProfit: 9_600_000,
    cashClose: Array(12).fill(3_000_000), monthlyOpex: Array(12).fill(1_500_000),
    businessBreakeven: 18_000_000, totalEquity: 8_000_000, totalLiabilities: 2_000_000,
    dscrMin: 1.8, hasDebt: true, cashGaps: 0, tradeCreditDpo: 25,
    monthsOfActualData: 12, monthsElapsed: 12, monthsClosed: 10, fieldAppMonths: 8,
    revenueGrowthRate: 0.15, customersAcquired: 30, irr: 0.22, revenuePerHead: 6_000_000,
    assess: defaultCoachAssessment(),
    ...over,
  }
}

describe('Visibility verification uplift — additive and regression-safe', () => {
  it('REG: with no verification data, score and indicators are exactly the prior behaviour', () => {
    const r = computeVisibility(inputs())
    // Five indicators, no "Payments Verified" row, until reconciliation exists.
    expect(r.indicators.map(i => i.label)).not.toContain('Payments Verified')
    expect(r.indicators).toHaveLength(5)
  })

  it('a cash/unlinked business (share 0) is never pushed below the base', () => {
    const base = computeVisibility(inputs()).score
    const withZero = computeVisibility(inputs({ verifiedValueShare: 0 })).score
    expect(withZero).toBe(base)
  })

  it('verification only ever lifts the score', () => {
    const base = computeVisibility(inputs()).score
    const lifted = computeVisibility(inputs({ verifiedValueShare: 1 })).score
    expect(lifted).toBeGreaterThan(base)
    expect(lifted).toBeLessThanOrEqual(100)
  })

  it('score is monotonic in verified share', () => {
    const scores = [0, 0.25, 0.5, 0.75, 1].map(s => computeVisibility(inputs({ verifiedValueShare: s })).score)
    for (let k = 1; k < scores.length; k++) expect(scores[k]).toBeGreaterThanOrEqual(scores[k - 1])
  })

  it('surfaces a Payments Verified indicator once verification is configured', () => {
    const r = computeVisibility(inputs({ verifiedValueShare: 0.6 }))
    const pv = r.indicators.find(i => i.label === 'Payments Verified')
    expect(pv).toBeDefined()
    expect(pv!.value).toBe(60)
  })
})
