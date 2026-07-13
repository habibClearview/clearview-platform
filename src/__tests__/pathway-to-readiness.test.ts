import { describe, it, expect } from 'vitest'
import { computePathwayToReadiness, type LRSDimensionKey, type DimensionHistoryPoint } from '../lib/pathway-to-readiness'
import type { LRSResult } from '../lib/liquidity-readiness'
import { LRS_WEIGHTS } from '../lib/liquidity-readiness'

function makeLRS(scores: Partial<Record<LRSDimensionKey, number>> = {}): LRSResult {
  const dims: LRSDimensionKey[] = ['marketOpportunity', 'visibility', 'trust', 'profitability', 'capacity', 'resilience', 'compliance']
  const dimensions = Object.fromEntries(dims.map(d => [d, { score: scores[d] ?? 50, indicators: [] }])) as unknown as LRSResult['dimensions']
  const score = dims.reduce((s, d) => s + dimensions[d].score, 0) / dims.length
  return { score, dimensions }
}

function historyOf(scores: number[]): DimensionHistoryPoint[] {
  return scores.map((score, i) => ({ monthIndex: i, score }))
}

describe('computePathwayToReadiness — ranking', () => {
  it('REG: ranks dimensions by weighted gap (potentialLift), largest first', () => {
    // trust: weight 0.15, score 10 -> gap 90 -> lift 13.5
    // compliance: weight 0.10, score 10 -> gap 90 -> lift 9.0
    // marketOpportunity: weight 0.20, score 95 -> gap 5 -> lift 1.0
    const lrs = makeLRS({ trust: 10, compliance: 10, marketOpportunity: 95 })
    const r = computePathwayToReadiness(lrs, LRS_WEIGHTS, {})
    expect(r[0].dimension).toBe('trust')
    expect(r[1].dimension).toBe('compliance')
  })

  it('REG: returns exactly topN opportunities, defaulting to 3', () => {
    const r = computePathwayToReadiness(makeLRS(), LRS_WEIGHTS, {})
    expect(r.length).toBe(3)
  })

  it('REG: a dimension already at 100 has zero potential lift and never leads the ranking', () => {
    const lrs = makeLRS({ trust: 100, visibility: 20 })
    const r = computePathwayToReadiness(lrs, LRS_WEIGHTS, {}, 7)
    const trustEntry = r.find(o => o.dimension === 'trust')!
    expect(trustEntry.potentialLift).toBe(0)
    expect(r[0].dimension).not.toBe('trust')
  })
})

describe('computePathwayToReadiness — actions', () => {
  it('REG: every dimension returns concrete, non-empty actions', () => {
    const r = computePathwayToReadiness(makeLRS(), LRS_WEIGHTS, {}, 7)
    r.forEach(o => {
      expect(o.actions.length).toBeGreaterThan(0)
      o.actions.forEach(a => expect(a.length).toBeGreaterThan(10))
    })
  })
})

describe('computePathwayToReadiness — timing: insufficient history', () => {
  it('REG: no history at all reports insufficient_history, not a fabricated estimate', () => {
    const r = computePathwayToReadiness(makeLRS({ trust: 10 }), LRS_WEIGHTS, {}, 1)
    expect(r[0].timing).toEqual({ status: 'insufficient_history' })
  })

  it('REG: fewer than 3 real historical points still reports insufficient_history', () => {
    const r = computePathwayToReadiness(makeLRS({ trust: 10 }), LRS_WEIGHTS, { trust: historyOf([10, 15]) }, 1)
    expect(r[0].timing).toEqual({ status: 'insufficient_history' })
  })
})

describe('computePathwayToReadiness — timing: no improving trend', () => {
  it('REG: a flat trend reports no_improving_trend, not a wildly large or infinite time estimate', () => {
    const r = computePathwayToReadiness(makeLRS({ trust: 40 }), LRS_WEIGHTS, { trust: historyOf([40, 40, 40, 40]) }, 7)
    expect(r.find(o => o.dimension === 'trust')!.timing).toEqual({ status: 'no_improving_trend' })
  })

  it('REG: a declining trend also reports no_improving_trend', () => {
    const r = computePathwayToReadiness(makeLRS({ trust: 40 }), LRS_WEIGHTS, { trust: historyOf([50, 45, 42, 40]) }, 7)
    expect(r.find(o => o.dimension === 'trust')!.timing).toEqual({ status: 'no_improving_trend' })
  })
})

describe('computePathwayToReadiness — timing: projected', () => {
  it('REG: a genuinely improving trend produces a real monthly rate and a months-to-close estimate', () => {
    // trust rising 5 points/month, currently at 40 -- gap of 60 should take 12 months at this rate
    const r = computePathwayToReadiness(makeLRS({ trust: 40 }), LRS_WEIGHTS, { trust: historyOf([20, 25, 30, 35, 40]) }, 7)
    const timing = r.find(o => o.dimension === 'trust')!.timing
    expect(timing.status).toBe('projected')
    if (timing.status === 'projected') {
      expect(timing.monthlyRate).toBeCloseTo(5, 6)
      expect(timing.monthsToClose).toBe(12)
      expect(timing.exceedsHorizon).toBe(false)
    }
  })

  it('REG: a very slow trend is capped at the timing horizon and flagged as exceeding it, not shown as an absurd raw number', () => {
    // trust rising 0.1 points/month, currently at 40 -- gap of 60 would take 600 months raw
    const r = computePathwayToReadiness(makeLRS({ trust: 40 }), LRS_WEIGHTS, { trust: historyOf([39.8, 39.9, 40.0, 40.1, 40.2]) }, 7)
    const timing = r.find(o => o.dimension === 'trust')!.timing
    expect(timing.status).toBe('projected')
    if (timing.status === 'projected') {
      expect(timing.monthsToClose).toBe(36)
      expect(timing.exceedsHorizon).toBe(true)
    }
  })

  it('REG: a non-monotonic but net-improving trend still produces a projected timing (real regression, not a naive first-vs-last)', () => {
    const r = computePathwayToReadiness(makeLRS({ trust: 55 }), LRS_WEIGHTS, { trust: historyOf([30, 45, 35, 50, 55]) }, 7)
    expect(r.find(o => o.dimension === 'trust')!.timing.status).toBe('projected')
  })
})
