import { describe, it, expect } from 'vitest'
import {
  computePortfolioOverview, computeSegmentReport, readinessStage, matchesFilter,
  anonymizedRefCode, revenueSizeBracket, buildAnonymisedProfile, rankedDimensionFailures,
  type ClientSnapshot,
} from '../lib/portfolio-intelligence'
import type { LRSResult } from '../lib/liquidity-readiness'
import type { FACTypeResult, FACResult } from '../lib/fund-absorption-capacity'

function makeLRS(scores: Partial<Record<keyof LRSResult['dimensions'], number>> = {}): LRSResult {
  const dims = ['marketOpportunity', 'visibility', 'trust', 'profitability', 'capacity', 'resilience', 'compliance'] as const
  const dimensions = Object.fromEntries(dims.map(d => [d, { score: scores[d] ?? 50, indicators: [] }])) as unknown as LRSResult['dimensions']
  const score = dims.reduce((s, d) => s + dimensions[d].score, 0) / dims.length
  return { score, dimensions }
}

function makeFACType(capacity: number | null): FACTypeResult {
  return { capacity, low: capacity, high: capacity, reason: capacity === null ? 'unavailable' : null, conditions: [] }
}
function makeFAC(overrides: Partial<Record<keyof FACResult, number | null>> = {}): FACResult {
  return {
    credit: makeFACType(overrides.credit as number ?? 100),
    grant: makeFACType(overrides.grant as number ?? 200),
    equity: makeFACType(overrides.equity as number ?? 300),
    consignment: makeFACType((overrides.consignment as number) ?? null),
    recoverableGrant: makeFACType(overrides.recoverableGrant as number ?? 150),
    dataConfidence: 'reliable',
    repayableFractionUsed: 0.5,
    repayableFractionWasDefaulted: true,
  }
}

function makeSnapshot(overrides: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    clientId: 'c1', name: 'Test Co', sector: 'agribusiness', country: 'Uganda', programmeId: null,
    irScore: 20, irTier: 'Near Ready',
    lrs: makeLRS(), confidenceScore: 60, confidenceBadges: [], fac: makeFAC(),
    currency: 'UGX', annualRevenue: 500_000, businessUnits: [], consentToBeNamed: false,
    ...overrides,
  }
}

describe('readinessStage', () => {
  it('REG: maps every known IR tier to its stage, and an unknown tier falls back to pre_investment (not crashing)', () => {
    expect(readinessStage('Investment Ready')).toBe('investment_ready')
    expect(readinessStage('Near Ready')).toBe('near_ready')
    expect(readinessStage('Development Stage')).toBe('development_stage')
    expect(readinessStage('Pre-Investment')).toBe('pre_investment')
    expect(readinessStage('Something Unexpected')).toBe('pre_investment')
  })
})

describe('matchesFilter', () => {
  const s = makeSnapshot({ sector: 'agribusiness', country: 'Uganda', programmeId: 'p1', irTier: 'Investment Ready', confidenceScore: 75 })

  it('REG: an empty filter matches everything', () => {
    expect(matchesFilter(s, {})).toBe(true)
  })
  it('REG: a matching sector filter passes, a non-matching one excludes', () => {
    expect(matchesFilter(s, { sector: 'agribusiness' })).toBe(true)
    expect(matchesFilter(s, { sector: 'input supply' })).toBe(false)
  })
  it('REG: readinessStage filter matches the derived stage, not the raw tier string', () => {
    expect(matchesFilter(s, { readinessStage: 'investment_ready' })).toBe(true)
    expect(matchesFilter(s, { readinessStage: 'near_ready' })).toBe(false)
  })
  it('REG: confidence range filter is inclusive at both ends', () => {
    expect(matchesFilter(s, { minConfidence: 75, maxConfidence: 75 })).toBe(true)
    expect(matchesFilter(s, { minConfidence: 76 })).toBe(false)
    expect(matchesFilter(s, { maxConfidence: 74 })).toBe(false)
  })
  it('REG: multiple filter fields combine with AND, not OR', () => {
    expect(matchesFilter(s, { sector: 'agribusiness', country: 'Kenya' })).toBe(false)
  })
})

describe('computePortfolioOverview', () => {
  it('REG: an empty portfolio returns zeroed averages, not NaN or a crash', () => {
    const r = computePortfolioOverview([])
    expect(r.totalBusinesses).toBe(0)
    expect(r.avgIRScore).toBe(0)
    expect(r.mostCommonWeakDimension).toBeNull()
    expect(r.verificationDistribution.every(b => b.count === 0)).toBe(true)
  })

  it('REG: readiness pipeline counts and percentages match the tiers of the snapshots given', () => {
    const snaps = [
      makeSnapshot({ irTier: 'Pre-Investment' }),
      makeSnapshot({ irTier: 'Development Stage' }),
      makeSnapshot({ irTier: 'Near Ready' }),
      makeSnapshot({ irTier: 'Investment Ready' }),
    ]
    const r = computePortfolioOverview(snaps)
    expect(r.readinessPipeline).toEqual({ pre_investment: 1, development_stage: 1, near_ready: 1, investment_ready: 1 })
    expect(r.readinessPipelinePct.investment_ready).toBeCloseTo(25, 6)
  })

  it('REG: mostCommonWeakDimension correctly identifies the lowest-average dimension across the portfolio', () => {
    const snaps = [
      makeSnapshot({ lrs: makeLRS({ trust: 10, visibility: 90 }) }),
      makeSnapshot({ lrs: makeLRS({ trust: 20, visibility: 80 }) }),
    ]
    const r = computePortfolioOverview(snaps)
    expect(r.mostCommonWeakDimension).toBe('trust')
  })

  it('REG: verification distribution bands are non-overlapping -- a score of exactly 20 counts once, in the 20-40 band', () => {
    const snaps = [makeSnapshot({ confidenceScore: 20 })]
    const r = computePortfolioOverview(snaps)
    const totalCounted = r.verificationDistribution.reduce((s, b) => s + b.count, 0)
    expect(totalCounted).toBe(1)
    expect(r.verificationDistribution.find(b => b.label === '20-40')!.count).toBe(1)
    expect(r.verificationDistribution.find(b => b.label === '0-20')!.count).toBe(0)
  })

  it('REG: a score of exactly 100 lands in the top band (inclusive at both ends only for the last band)', () => {
    const r = computePortfolioOverview([makeSnapshot({ confidenceScore: 100 })])
    expect(r.verificationDistribution.find(b => b.label === '80-100')!.count).toBe(1)
  })

  it('REG: current fund absorption averages exclude nulls rather than treating them as zero', () => {
    // Two businesses: one has a consignment figure, one has none (no input
    // shop unit) -- the average should be based on the one real figure,
    // not (figure + 0) / 2.
    const snaps = [
      makeSnapshot({ fac: makeFAC({ consignment: 400 }) }),
      makeSnapshot({ fac: makeFAC({ consignment: null }) }),
    ]
    const r = computePortfolioOverview(snaps)
    expect(r.currentFundAbsorption['UGX'].consignment).toBe(400)
  })

  it('REG: a capital type where every business is null reports null, not zero', () => {
    const snaps = [makeSnapshot({ fac: makeFAC({ consignment: null }) })]
    const r = computePortfolioOverview(snaps)
    expect(r.currentFundAbsorption['UGX'].consignment).toBeNull()
  })

  it('REG: clients in different currencies produce separate per-currency fund absorption summaries, never a blended average', () => {
    // A UGX client with credit capacity in the tens of millions and a USD
    // client with credit capacity in the thousands -- averaging these
    // directly would produce a meaningless blended figure. Each currency
    // must get its own summary computed only from its own snapshots.
    const snaps = [
      makeSnapshot({ currency: 'UGX', fac: makeFAC({ credit: 40_000_000, consignment: 5_000_000 }) }),
      makeSnapshot({ currency: 'UGX', fac: makeFAC({ credit: 60_000_000, consignment: null }) }),
      makeSnapshot({ currency: 'USD', fac: makeFAC({ credit: 10_000 }) }),
    ]
    const r = computePortfolioOverview(snaps)
    expect(Object.keys(r.currentFundAbsorption).sort()).toEqual(['UGX', 'USD'])
    expect(r.currentFundAbsorption['UGX'].credit).toBeCloseTo(50_000_000, 6)
    expect(r.currentFundAbsorption['UGX'].consignment).toBe(5_000_000)
    expect(r.currentFundAbsorption['USD'].credit).toBe(10_000)
    // Sanity check that the old blended-average bug is gone: a naive
    // average across all three snapshots would land far below either
    // currency's true per-currency average.
    expect(r.currentFundAbsorption['UGX'].credit).not.toBeCloseTo((40_000_000 + 60_000_000 + 10_000) / 3, 0)
  })

  it('REG: non-monetary aggregates (avgIRScore, mostCommonWeakDimension) are computed across ALL snapshots regardless of currency, not currency-scoped', () => {
    const snaps = [
      makeSnapshot({ currency: 'UGX', irScore: 10, lrs: makeLRS({ trust: 10, visibility: 90 }) }),
      makeSnapshot({ currency: 'USD', irScore: 30, lrs: makeLRS({ trust: 20, visibility: 80 }) }),
    ]
    const r = computePortfolioOverview(snaps)
    // These are 0-100/0-30 scores and counts, not monetary figures, so they
    // stay a single portfolio-wide average across both currencies.
    expect(r.avgIRScore).toBeCloseTo(20, 6)
    expect(r.mostCommonWeakDimension).toBe('trust')
    expect(r.totalBusinesses).toBe(2)
  })
})

describe('computeSegmentReport', () => {
  it('REG: segment averages reflect only the filtered subset, portfolio averages reflect everyone', () => {
    const snaps = [
      makeSnapshot({ sector: 'agribusiness', lrs: makeLRS({ trust: 90 }) }),
      makeSnapshot({ sector: 'agribusiness', lrs: makeLRS({ trust: 90 }) }),
      makeSnapshot({ sector: 'input supply', lrs: makeLRS({ trust: 10 }) }),
    ]
    const r = computeSegmentReport(snaps, { sector: 'agribusiness' })
    expect(r.segment.totalBusinesses).toBe(2)
    expect(r.portfolio.totalBusinesses).toBe(3)
    expect(r.segment.dimensionAverages.trust).toBeCloseTo(90, 6)
    expect(r.portfolio.dimensionAverages.trust).toBeLessThan(90)
  })

  it('REG: dimensionComparison delta is segmentAvg minus portfolioAvg, negative when the segment lags', () => {
    const snaps = [
      makeSnapshot({ sector: 'weak', lrs: makeLRS({ profitability: 20 }) }),
      makeSnapshot({ sector: 'strong', lrs: makeLRS({ profitability: 80 }) }),
    ]
    const r = computeSegmentReport(snaps, { sector: 'weak' })
    const profComparison = r.dimensionComparison.find(d => d.dimension === 'profitability')!
    expect(profComparison.segmentAvg).toBeCloseTo(20, 6)
    expect(profComparison.delta).toBeLessThan(0)
  })

  it('REG: weakestDimensionsInSegment is ranked weakest-first, using the SEGMENT average not the portfolio average', () => {
    const snaps = [
      makeSnapshot({ sector: 'target', lrs: makeLRS({ trust: 10, compliance: 90 }) }),
      makeSnapshot({ sector: 'other', lrs: makeLRS({ trust: 90, compliance: 10 }) }),
    ]
    const r = computeSegmentReport(snaps, { sector: 'target' })
    expect(r.weakestDimensionsInSegment[0]).toBe('trust')
  })

  it('REG: an empty segment (filter matches nothing) does not crash and reports zero businesses', () => {
    const snaps = [makeSnapshot({ sector: 'agribusiness' })]
    const r = computeSegmentReport(snaps, { sector: 'nonexistent' })
    expect(r.segment.totalBusinesses).toBe(0)
    expect(r.portfolio.totalBusinesses).toBe(1)
  })
})

describe('rankedDimensionFailures', () => {
  it('REG: an empty portfolio returns an empty list, not a crash', () => {
    expect(rankedDimensionFailures([])).toEqual([])
  })

  it('REG: ranks weakest-average dimensions first, defaults to the top 3 of all seven', () => {
    const snaps = [
      makeSnapshot({ lrs: makeLRS({ trust: 10, resilience: 20, visibility: 30, marketOpportunity: 90, profitability: 90, capacity: 90, compliance: 90 }) }),
    ]
    const r = rankedDimensionFailures(snaps)
    expect(r).toHaveLength(3)
    expect(r.map(f => f.dimension)).toEqual(['trust', 'resilience', 'visibility'])
  })

  it('REG: countBelowThreshold only counts businesses actually below the threshold, using real per-business scores', () => {
    const snaps = [
      makeSnapshot({ lrs: makeLRS({ trust: 10 }) }),
      makeSnapshot({ lrs: makeLRS({ trust: 90 }) }),
      makeSnapshot({ lrs: makeLRS({ trust: 40 }) }),
    ]
    const r = rankedDimensionFailures(snaps, 50, 1)
    expect(r[0].dimension).toBe('trust')
    expect(r[0].countBelowThreshold).toBe(2)
    expect(r[0].totalCount).toBe(3)
    expect(r[0].avgScore).toBeCloseTo((10 + 90 + 40) / 3, 6)
  })

  it('REG: the `top` parameter caps how many dimensions are returned', () => {
    const snaps = [makeSnapshot()]
    expect(rankedDimensionFailures(snaps, 50, 1)).toHaveLength(1)
    expect(rankedDimensionFailures(snaps, 50, 7)).toHaveLength(7)
  })
})

describe('anonymizedRefCode', () => {
  it('REG: the same clientId always produces the same code', () => {
    expect(anonymizedRefCode('client-abc-123')).toBe(anonymizedRefCode('client-abc-123'))
  })

  it('REG: different clientIds produce different codes (no collisions across a reasonable sample)', () => {
    const codes = new Set(Array.from({ length: 200 }, (_, i) => anonymizedRefCode(`client-${i}`)))
    expect(codes.size).toBe(200)
  })

  it('REG: the code never contains the raw clientId as a substring', () => {
    const clientId = 'super-secret-client-id-99'
    expect(anonymizedRefCode(clientId)).not.toContain(clientId)
  })

  it('REG: the code has the expected BIZ-XXXXX shape', () => {
    expect(anonymizedRefCode('c1')).toMatch(/^BIZ-[0-9A-Z]{5}$/)
  })
})

describe('revenueSizeBracket', () => {
  it('REG: fewer than 4 same-currency peers reports "not enough peers" rather than a false bracket', () => {
    const target = makeSnapshot({ currency: 'UGX', annualRevenue: 1000 })
    const peers = [makeSnapshot({ currency: 'UGX', annualRevenue: 500 }), makeSnapshot({ currency: 'UGX', annualRevenue: 2000 })]
    expect(revenueSizeBracket(target, [target, ...peers])).toBe('Not enough peers to bracket')
  })

  it('REG: quartiles are computed only from peers in the SAME currency -- a different-currency business never affects the bracket', () => {
    const ugxPeers = [100, 200, 300, 400, 500].map(v => makeSnapshot({ currency: 'UGX', annualRevenue: v }))
    const usdOutlier = makeSnapshot({ currency: 'USD', annualRevenue: 999_999_999 })
    const target = ugxPeers[2] // annualRevenue 300, the median of the UGX group
    const bracket = revenueSizeBracket(target, [...ugxPeers, usdOutlier])
    expect(bracket).not.toBe('Not enough peers to bracket')
    expect(bracket).toBe('Medium')
  })

  it('REG: the lowest-revenue peer in a group is bracketed Small, the highest Very Large', () => {
    const group = [100, 200, 300, 400, 500].map(v => makeSnapshot({ currency: 'UGX', annualRevenue: v }))
    expect(revenueSizeBracket(group[0], group)).toBe('Small')
    expect(revenueSizeBracket(group[4], group)).toBe('Very Large')
  })
})

describe('buildAnonymisedProfile', () => {
  it('REG: a non-consenting business shows its reference code as the display name, not the real name', () => {
    const s = makeSnapshot({ name: 'Real Business Name Ltd', consentToBeNamed: false })
    const profile = buildAnonymisedProfile(s, [s])
    expect(profile.isNamed).toBe(false)
    expect(profile.displayName).toBe(profile.refCode)
    expect(profile.displayName).not.toContain('Real Business Name')
  })

  it('REG: a consenting business shows its real name as the display name', () => {
    const s = makeSnapshot({ name: 'Real Business Name Ltd', consentToBeNamed: true })
    const profile = buildAnonymisedProfile(s, [s])
    expect(profile.isNamed).toBe(true)
    expect(profile.displayName).toBe('Real Business Name Ltd')
  })

  it('REG: the profile never exposes clientId directly -- only the derived refCode', () => {
    const s = makeSnapshot({ clientId: 'super-secret-id' })
    const profile = buildAnonymisedProfile(s, [s])
    expect((profile as any).clientId).toBeUndefined()
    expect(JSON.stringify(profile)).not.toContain('super-secret-id')
  })
})
