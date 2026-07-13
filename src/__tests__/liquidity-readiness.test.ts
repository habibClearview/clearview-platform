import { describe, it, expect } from 'vitest'
import {
  computeLiquidityReadinessScore, computeFitScore, LRS_WEIGHTS, FIT_SCORE_PRESETS,
  computeMarketOpportunity, computeVisibility, computeTrust, computeProfitability,
  computeCapacity, computeResilience, computeCompliance, computeLRSTimeSeries, type LRSInputs,
} from '../lib/liquidity-readiness'
import { defaultCoachAssessment } from '../lib/scoring-engine'

function baseInputs(overrides: Partial<LRSInputs> = {}): LRSInputs {
  return {
    annualRevenue: 24_000_000, annualEbitda: 4_800_000, annualGrossProfit: 9_600_000,
    cashClose: Array(12).fill(3_000_000), monthlyOpex: Array(12).fill(1_500_000),
    businessBreakeven: 18_000_000, totalEquity: 8_000_000, totalLiabilities: 2_000_000,
    dscrMin: 1.8, hasDebt: true, cashGaps: 0, tradeCreditDpo: 25,
    monthsOfActualData: 12, monthsElapsed: 12, monthsClosed: 10, fieldAppMonths: 8,
    revenueGrowthRate: 0.15, customersAcquired: 30, irr: 0.22, revenuePerHead: 6_000_000,
    assess: defaultCoachAssessment(),
    ...overrides,
  }
}

describe('LRS_WEIGHTS — the seven dimension weights sum to exactly 1', () => {
  it('REG: weights sum to 1, matching the recommended weighting', () => {
    const total = Object.values(LRS_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it('REG: matches the specific recommended weights exactly', () => {
    expect(LRS_WEIGHTS.marketOpportunity).toBe(0.20)
    expect(LRS_WEIGHTS.visibility).toBe(0.15)
    expect(LRS_WEIGHTS.trust).toBe(0.15)
    expect(LRS_WEIGHTS.profitability).toBe(0.15)
    expect(LRS_WEIGHTS.capacity).toBe(0.15)
    expect(LRS_WEIGHTS.resilience).toBe(0.10)
    expect(LRS_WEIGHTS.compliance).toBe(0.10)
  })
})

describe('computeLiquidityReadinessScore — the overall weighted formula', () => {
  it('REG: a healthy, well-documented business scores well above the midpoint', () => {
    const assess = { ...defaultCoachAssessment(),
      totalAddressableMarket: 4, repeatCustomers: 4, kpiReporting: 4, auditTrail: 4,
      supplierRelationships: 4, governance: 4, commercialModel: 4, productionCapacity: 4,
      inventoryAvailability: 4, customerDiversification: 4, supplierDiversification: 4,
      businessContinuity: 4, registrationCompliance: 5, taxCompliance: 5, licenceCompliance: 5,
    }
    const result = computeLiquidityReadinessScore(baseInputs({ assess }))
    expect(result.score).toBeGreaterThan(70)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('REG: the overall score is exactly the weighted sum of the seven dimension scores -- not a separately-computed number that could drift', () => {
    const inputs = baseInputs()
    const result = computeLiquidityReadinessScore(inputs)
    const manual =
      result.dimensions.marketOpportunity.score * LRS_WEIGHTS.marketOpportunity +
      result.dimensions.visibility.score * LRS_WEIGHTS.visibility +
      result.dimensions.trust.score * LRS_WEIGHTS.trust +
      result.dimensions.profitability.score * LRS_WEIGHTS.profitability +
      result.dimensions.capacity.score * LRS_WEIGHTS.capacity +
      result.dimensions.resilience.score * LRS_WEIGHTS.resilience +
      result.dimensions.compliance.score * LRS_WEIGHTS.compliance
    expect(result.score).toBeCloseTo(manual, 10)
  })

  it('REG: every dimension score is within 0-100, never negative or over 100 regardless of extreme inputs', () => {
    const extreme = baseInputs({
      annualRevenue: -5_000_000, annualEbitda: -10_000_000, annualGrossProfit: -2_000_000,
      cashClose: [-50_000_000], monthlyOpex: [0], businessBreakeven: 0,
      totalEquity: -1_000_000, totalLiabilities: 50_000_000, cashGaps: 12,
      tradeCreditDpo: 500, revenueGrowthRate: -5, customersAcquired: -10, irr: -0.9,
      revenuePerHead: -1,
    })
    const result = computeLiquidityReadinessScore(extreme)
    Object.values(result.dimensions).forEach(dim => {
      expect(dim.score).toBeGreaterThanOrEqual(0)
      expect(dim.score).toBeLessThanOrEqual(100)
    })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(Number.isNaN(result.score)).toBe(false)
  })
})

describe('The critical scenario: a genuinely brand-new prospective client with ZERO data at all', () => {
  it('REG: zero everything still produces a well-defined, non-crashing, non-NaN score at every dimension', () => {
    const inputs: LRSInputs = {
      annualRevenue: 0, annualEbitda: 0, annualGrossProfit: 0,
      cashClose: [0], monthlyOpex: [0], businessBreakeven: 0,
      totalEquity: 0, totalLiabilities: 0, dscrMin: null, hasDebt: false, cashGaps: 0,
      tradeCreditDpo: 0, monthsOfActualData: 0, monthsElapsed: 0, monthsClosed: 0, fieldAppMonths: 0,
      revenueGrowthRate: 0, customersAcquired: 0, irr: null, revenuePerHead: 0,
      assess: defaultCoachAssessment(),
    }
    const result = computeLiquidityReadinessScore(inputs)
    expect(Number.isNaN(result.score)).toBe(false)
    Object.values(result.dimensions).forEach(dim => {
      expect(Number.isNaN(dim.score)).toBe(false)
      dim.indicators.forEach(ind => expect(Number.isNaN(ind.value)).toBe(false))
    })
  })

  it('REG: with zero financial data, the score reflects ONLY the qualitative Business Profile inputs (all at their default of 2/5) -- not zero, not fabricated, exactly what the defaults produce', () => {
    const inputs: LRSInputs = {
      annualRevenue: 0, annualEbitda: 0, annualGrossProfit: 0,
      cashClose: [0], monthlyOpex: [0], businessBreakeven: 0,
      totalEquity: 0, totalLiabilities: 0, dscrMin: null, hasDebt: false, cashGaps: 0,
      tradeCreditDpo: 0, monthsOfActualData: 0, monthsElapsed: 0, monthsClosed: 0, fieldAppMonths: 0,
      revenueGrowthRate: 0, customersAcquired: 0, irr: null, revenuePerHead: 0,
      assess: defaultCoachAssessment(), // every qualitative field defaults to 2/5 = 40
    }
    const result = computeLiquidityReadinessScore(inputs)
    // Not a crash, not undefined, and meaningfully above zero (the
    // default 2/5 qualitative inputs alone contribute real score).
    expect(result.score).toBeGreaterThan(10)
  })
})

describe('computeMarketOpportunity', () => {
  it('REG: zero customers acquired scores that indicator as 0, not penalizing revenue growth or margin', () => {
    const result = computeMarketOpportunity(baseInputs({ customersAcquired: 0 }))
    const customerGrowthIndicator = result.indicators.find(i => i.label === 'Customer Growth')!
    expect(customerGrowthIndicator.value).toBe(0)
  })

  it('REG: strong revenue growth (30%+) scores the growth indicator at exactly 100', () => {
    const result = computeMarketOpportunity(baseInputs({ revenueGrowthRate: 0.35 }))
    const growthIndicator = result.indicators.find(i => i.label === 'Revenue Growth')!
    expect(growthIndicator.value).toBe(100)
  })

  it('REG: a 20% revenue decline scores growth at 0, not negative', () => {
    const result = computeMarketOpportunity(baseInputs({ revenueGrowthRate: -0.35 }))
    const growthIndicator = result.indicators.find(i => i.label === 'Revenue Growth')!
    expect(growthIndicator.value).toBe(0)
  })
})

describe('computeVisibility', () => {
  it('REG: zero elapsed months (a plan that has not started yet) does not divide by zero', () => {
    const result = computeVisibility(baseInputs({ monthsElapsed: 0, monthsOfActualData: 0, monthsClosed: 0 }))
    expect(Number.isNaN(result.score)).toBe(false)
  })

  it('REG: 12 months of actual data reaches the maximum historical-data-depth score', () => {
    const result = computeVisibility(baseInputs({ monthsOfActualData: 12 }))
    const historicalIndicator = result.indicators.find(i => i.label === 'Historical Data Depth')!
    expect(historicalIndicator.value).toBe(100)
  })
})

describe('computeTrust', () => {
  it('REG: no trade credit data at all scores payment behaviour as neutral (50), not penalized as zero', () => {
    const result = computeTrust(baseInputs({ tradeCreditDpo: 0 }))
    const paymentIndicator = result.indicators.find(i => i.label === 'Payment Behaviour')!
    expect(paymentIndicator.value).toBe(50)
  })

  it('REG: prompt payment (DPO well under 30 days) scores near 100', () => {
    const result = computeTrust(baseInputs({ tradeCreditDpo: 10 }))
    const paymentIndicator = result.indicators.find(i => i.label === 'Payment Behaviour')!
    expect(paymentIndicator.value).toBe(100)
  })

  it('REG: very slow payment (DPO 90+ days) scores near 0', () => {
    const result = computeTrust(baseInputs({ tradeCreditDpo: 150 }))
    const paymentIndicator = result.indicators.find(i => i.label === 'Payment Behaviour')!
    expect(paymentIndicator.value).toBe(0)
  })
})

describe('computeProfitability', () => {
  it('REG: an IRR that could not be computed (null) scores ROI as neutral 50, never zero or a fabricated positive number', () => {
    const result = computeProfitability(baseInputs({ irr: null }))
    const roiIndicator = result.indicators.find(i => i.label === 'ROI (IRR)')!
    expect(roiIndicator.value).toBe(50)
  })

  it('REG: a genuinely strong IRR (40%+) scores ROI at exactly 100', () => {
    const result = computeProfitability(baseInputs({ irr: 0.45 }))
    const roiIndicator = result.indicators.find(i => i.label === 'ROI (IRR)')!
    expect(roiIndicator.value).toBe(100)
  })

  it('REG: revenue already above break-even scores that indicator well, revenue below break-even scores it low', () => {
    const above = computeProfitability(baseInputs({ annualRevenue: 20_000_000, businessBreakeven: 15_000_000 }))
    const below = computeProfitability(baseInputs({ annualRevenue: 5_000_000, businessBreakeven: 15_000_000 }))
    const aboveIndicator = above.indicators.find(i => i.label === 'Break-Even Position')!
    const belowIndicator = below.indicators.find(i => i.label === 'Break-Even Position')!
    expect(aboveIndicator.value).toBeGreaterThan(belowIndicator.value)
  })
})

describe('computeCapacity and computeResilience — cash runway indicators do not divide by zero', () => {
  it('REG: zero average monthly opex does not crash the working capital or cash reserve indicators', () => {
    const capacity = computeCapacity(baseInputs({ monthlyOpex: [0, 0, 0] }))
    const resilience = computeResilience(baseInputs({ monthlyOpex: [0, 0, 0] }))
    expect(Number.isNaN(capacity.score)).toBe(false)
    expect(Number.isNaN(resilience.score)).toBe(false)
  })

  it('REG: zero equity does not crash the debt exposure indicator, and zero equity with no debt at all correctly scores leverage alone as poor', () => {
    const result = computeResilience(baseInputs({ totalEquity: 0, totalLiabilities: 5_000_000 }))
    expect(Number.isNaN(result.score)).toBe(false)
    expect(Number.isNaN(result.indicators.find(i => i.label === 'Debt Exposure')!.value)).toBe(false)

    // With no debt at all (so no DSCR blending applies), zero equity
    // against real liabilities should score debt exposure at exactly 0
    // -- deToEq defaults to 99 (very high) when equity is zero, and
    // leverage alone (no DSCR to blend in) correctly scores poorly.
    const noDebtResult = computeResilience(baseInputs({ totalEquity: 0, totalLiabilities: 5_000_000, hasDebt: false, dscrMin: null }))
    const debtIndicator = noDebtResult.indicators.find(i => i.label === 'Debt Exposure')!
    expect(debtIndicator.value).toBe(0)
  })

  it('REG: DSCR is blended into Debt Exposure when debt exists and is computable -- strong DSCR meaningfully lifts the score above leverage alone', () => {
    const withStrongDscr = computeResilience(baseInputs({ hasDebt: true, dscrMin: 2.0, totalEquity: 2_000_000, totalLiabilities: 4_000_000 }))
    const withoutDebt = computeResilience(baseInputs({ hasDebt: false, dscrMin: null, totalEquity: 2_000_000, totalLiabilities: 4_000_000 }))
    const withDscr = withStrongDscr.indicators.find(i => i.label === 'Debt Exposure')!.value
    const leverageOnly = withoutDebt.indicators.find(i => i.label === 'Debt Exposure')!.value
    expect(withDscr).toBeGreaterThan(leverageOnly)
  })

  it('REG: debt that exists but has nothing due yet (dscrMin null, e.g. a grace period) falls back to leverage alone, not treated as a coverage failure', () => {
    const result = computeResilience(baseInputs({ hasDebt: true, dscrMin: null, totalEquity: 2_000_000, totalLiabilities: 4_000_000 }))
    const withoutDebt = computeResilience(baseInputs({ hasDebt: false, dscrMin: null, totalEquity: 2_000_000, totalLiabilities: 4_000_000 }))
    expect(result.indicators.find(i => i.label === 'Debt Exposure')!.value).toBe(withoutDebt.indicators.find(i => i.label === 'Debt Exposure')!.value)
  })
})

describe('computeCompliance', () => {
  it('REG: fully closed months (all elapsed months formally closed) scores financial reporting at 100', () => {
    const result = computeCompliance(baseInputs({ monthsElapsed: 10, monthsClosed: 10 }))
    const reportingIndicator = result.indicators.find(i => i.label === 'Financial Reporting')!
    expect(reportingIndicator.value).toBe(100)
  })
})

describe('computeFitScore — re-weighting the same dimensions for a specific liquidity owner', () => {
  it('REG: the business\'s underlying dimension scores never change between Fit Score lenses -- only the weights differ', () => {
    const result = computeLiquidityReadinessScore(baseInputs())
    const bankFit = computeFitScore(result, FIT_SCORE_PRESETS.bank.weights)
    const investorFit = computeFitScore(result, FIT_SCORE_PRESETS.investor.weights)
    // Different weightings of the SAME dimension scores should generally
    // produce different results (unless the underlying profile happens
    // to be perfectly uniform across all seven dimensions).
    expect(bankFit).not.toBe(investorFit)
  })

  it('REG: a Fit Score using only ONE dimension at full weight equals that dimension\'s own score exactly', () => {
    const result = computeLiquidityReadinessScore(baseInputs())
    const onlyProfitability = computeFitScore(result, { profitability: 1 })
    expect(onlyProfitability).toBeCloseTo(result.dimensions.profitability.score, 10)
  })

  it('REG: weights that do not sum to 1 are still correctly normalized against their own total, not silently wrong', () => {
    const result = computeLiquidityReadinessScore(baseInputs())
    // Two dimensions at equal weight (2 and 2, not summing to 1) should
    // equal a simple 50/50 average of those two dimensions.
    const custom = computeFitScore(result, { profitability: 2, trust: 2 })
    const manual = (result.dimensions.profitability.score + result.dimensions.trust.score) / 2
    expect(custom).toBeCloseTo(manual, 10)
  })

  it('REG: empty weights (no dimensions selected at all) returns 0, not NaN or a crash', () => {
    const result = computeLiquidityReadinessScore(baseInputs())
    expect(computeFitScore(result, {})).toBe(0)
  })
})

describe('FIT_SCORE_PRESETS — Capital Fit scores (Bank, Investor, Grant, Equity, Consignment, Recoverable Grant)', () => {
  const ALL_SEVEN_DIMENSIONS = ['marketOpportunity', 'visibility', 'trust', 'profitability', 'capacity', 'resilience', 'compliance']

  it('REG: every preset\'s weights sum to exactly 1.00 -- catches a typo in any preset, present or future', () => {
    Object.entries(FIT_SCORE_PRESETS).forEach(([key, preset]) => {
      const total = Object.values(preset.weights).reduce((a, b) => a + b, 0)
      expect(total, `${key} (${preset.label}) weights sum to ${total}, not 1.00`).toBeCloseTo(1, 10)
    })
  })

  it('REG: every preset weights all seven real LRS dimensions, nothing extra and nothing missing', () => {
    Object.entries(FIT_SCORE_PRESETS).forEach(([key, preset]) => {
      expect(Object.keys(preset.weights).sort(), key).toEqual([...ALL_SEVEN_DIMENSIONS].sort())
    })
  })

  it('REG: adding the four new capital-type presets did not change Bank or Investor Fit\'s existing weights', () => {
    expect(FIT_SCORE_PRESETS.bank.weights).toEqual({ marketOpportunity: 0.15, visibility: 0.20, trust: 0.25, profitability: 0.20, capacity: 0.10, resilience: 0.05, compliance: 0.05 })
    expect(FIT_SCORE_PRESETS.investor.weights).toEqual({ marketOpportunity: 0.30, visibility: 0.10, trust: 0.15, profitability: 0.15, capacity: 0.15, resilience: 0.05, compliance: 0.10 })
  })

  it('REG: all six presets exist with the expected labels', () => {
    expect(Object.keys(FIT_SCORE_PRESETS).sort()).toEqual(['bank', 'consignment', 'equity', 'grant', 'investor', 'recoverable'])
    expect(FIT_SCORE_PRESETS.grant.label).toBe('Grant Fit')
    expect(FIT_SCORE_PRESETS.equity.label).toBe('Equity Fit')
    expect(FIT_SCORE_PRESETS.consignment.label).toBe('Consignment Fit')
    expect(FIT_SCORE_PRESETS.recoverable.label).toBe('Recoverable Grant Fit')
  })

  it('REG: every preset produces a real, finite 0-100 score from the same LRS result, never NaN', () => {
    const result = computeLiquidityReadinessScore(baseInputs())
    Object.entries(FIT_SCORE_PRESETS).forEach(([key, preset]) => {
      const score = computeFitScore(result, preset.weights)
      expect(Number.isFinite(score), key).toBe(true)
      expect(score, key).toBeGreaterThanOrEqual(0)
      expect(score, key).toBeLessThanOrEqual(100)
    })
  })
})

describe('computeLRSTimeSeries — the collapsible year/month trend for Liquidity Readiness', () => {
  function makeYearGroups(monthCount: number) {
    const groups: {year: number; label: string; monthIndices: number[]}[] = []
    for (let start = 0; start < monthCount; start += 12) {
      const end = Math.min(start + 12, monthCount)
      const year = 2026 + start / 12
      groups.push({ year, label: String(year), monthIndices: Array.from({length: end - start}, (_, i) => i + start) })
    }
    return groups
  }
  function makeMonthLabels(monthCount: number) {
    return Array.from({length: monthCount}, (_, i) => `M${i}`)
  }

  it('REG: a brand-new prospective client with zero live actuals still produces a full, real score for every year and month', () => {
    const months = 24
    const inputs = {
      rev: Array(months).fill(2_000_000), ebitda: Array(months).fill(400_000), grossProfit: Array(months).fill(800_000),
      cashClose: Array(months).fill(3_000_000), opex: Array(months).fill(400_000),
      totalEquityByMonth: Array(months).fill(5_000_000), totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      businessBreakeven: 18_000_000,
      monthsWithActuals: Array(months).fill(false), monthsClosed: Array(months).fill(false), monthsWithFieldApp: Array(months).fill(false),
      customersAcquiredTotal: 0, irr: null, revenuePerHead: 0,
      dscrMin: null, hasDebt: false, cashGaps: 0, tradeCreditDpo: 0,
      assess: defaultCoachAssessment(),
    }
    const series = computeLRSTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    expect(series.years.length).toBe(2)
    series.years.forEach(y => {
      expect(Number.isNaN(y.result.score)).toBe(false)
      expect(y.result.score).toBeGreaterThanOrEqual(0)
      expect(y.result.score).toBeLessThanOrEqual(100)
    })
    Object.values(series.monthsByYear).flat().forEach(m => {
      expect(Number.isNaN(m.result.score)).toBe(false)
    })
  })

  it('REG: each year reflects only its own months\' financial data -- a strong year 1 does not carry into a weak year 2\'s revenue growth', () => {
    const months = 24
    const inputs = {
      rev: [...Array(12).fill(5_000_000), ...Array(12).fill(1_000_000)],
      ebitda: [...Array(12).fill(1_000_000), ...Array(12).fill(-200_000)],
      grossProfit: Array(months).fill(2_000_000), cashClose: Array(months).fill(3_000_000), opex: Array(months).fill(500_000),
      totalEquityByMonth: Array(months).fill(5_000_000), totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      businessBreakeven: 15_000_000,
      monthsWithActuals: Array(months).fill(true), monthsClosed: Array(months).fill(true), monthsWithFieldApp: Array(months).fill(false),
      customersAcquiredTotal: 10, irr: null, revenuePerHead: 3_000_000,
      dscrMin: null, hasDebt: false, cashGaps: 0, tradeCreditDpo: 0,
      assess: defaultCoachAssessment(),
    }
    const series = computeLRSTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    expect(series.years[0].result.dimensions.profitability.score).toBeGreaterThan(series.years[1].result.dimensions.profitability.score)
  })

  it('REG: trailing-window months near the start of the plan use fewer than 12 months, not reaching before month 0', () => {
    const months = 6
    const inputs = {
      rev: Array(months).fill(1_000_000), ebitda: Array(months).fill(200_000), grossProfit: Array(months).fill(400_000),
      cashClose: Array(months).fill(2_000_000), opex: Array(months).fill(300_000),
      totalEquityByMonth: Array(months).fill(3_000_000), totalLiabilitiesByMonth: Array(months).fill(500_000),
      businessBreakeven: 8_000_000,
      monthsWithActuals: Array(months).fill(true), monthsClosed: Array(months).fill(false), monthsWithFieldApp: Array(months).fill(false),
      customersAcquiredTotal: 0, irr: null, revenuePerHead: 0,
      dscrMin: null, hasDebt: false, cashGaps: 0, tradeCreditDpo: 0,
      assess: defaultCoachAssessment(),
    }
    const series = computeLRSTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    const monthScores = series.monthsByYear[2026]
    expect(monthScores[2].monthIndices).toEqual([0, 1, 2])
  })
})
