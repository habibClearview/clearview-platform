import { describe, it, expect } from 'vitest'
import { computeFundAbsorptionCapacity, type FACInputs } from '../lib/fund-absorption-capacity'

// Monthly revenue implied by the default annualRevenue below is 100,000 --
// the stress-close figures need to be in that neighbourhood (a realistic
// cash buffer for a business this size), not an arbitrary small constant,
// or every credit-capacity scenario collapses to zero regardless of what's
// being tested.
function makeInputs(overrides: Partial<FACInputs> = {}): FACInputs {
  return {
    stressClose_4wk: Array(12).fill(150_000),
    scpDataConfidence: 'reliable',
    cashConversionGapDays: 30,
    annualRevenue: 1_200_000,
    annualGrossProfit: 480_000,
    annualEbitda: 240_000,
    annualNpat: 120_000,
    productionCapacityScore: 80,
    governanceScore: 4,
    revTrend: 'Stable',
    inputShopUnit: { annualRevenue: 600_000, annualGrossProfit: 180_000 },
    recordsCompletenessPct: 85,
    ...overrides,
  }
}

describe('computeFundAbsorptionCapacity — credit capacity', () => {
  it('REG: insufficient §SCP data returns null credit capacity, not a fabricated figure', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'insufficient', stressClose_4wk: [] }))
    expect(r.credit.capacity).toBeNull()
    expect(r.credit.reason).toMatch(/unlock/i)
  })

  it('REG: an already cash-stressed business (negative stress floor) gets zero credit capacity with a clear reason', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ stressClose_4wk: [150_000, 90_000, -5_000, 60_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000] }))
    expect(r.credit.capacity).toBe(0)
    expect(r.credit.reason).toMatch(/existing cash stress/i)
  })

  it('REG: a healthy business gets a positive credit capacity with a low/high band bracketing it', () => {
    const r = computeFundAbsorptionCapacity(makeInputs())
    expect(r.credit.capacity).not.toBeNull()
    expect(r.credit.capacity!).toBeGreaterThan(0)
    expect(r.credit.low!).toBeCloseTo(r.credit.capacity! * 0.80, 6)
    expect(r.credit.high!).toBeCloseTo(r.credit.capacity! * 1.20, 6)
  })

  it('REG: "limited" data confidence applies a 0.7 discount relative to "reliable" with identical inputs otherwise', () => {
    const reliable = computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'reliable' }))
    const limited = computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'limited' }))
    expect(limited.credit.capacity!).toBeCloseTo(reliable.credit.capacity! * 0.7, 2)
  })

  it('REG: a supplier-financed business (cashConversionGap <= 0) does not divide by zero -- repaymentMonths floors at 1', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ cashConversionGapDays: -20 }))
    expect(r.credit.capacity).not.toBeNull()
    expect(Number.isFinite(r.credit.capacity!)).toBe(true)
    expect(r.credit.capacity!).toBeGreaterThanOrEqual(0)
  })

  it('REG: a higher interest rate never produces a larger credit capacity than a lower one, all else equal', () => {
    const low = computeFundAbsorptionCapacity(makeInputs({ existingAnnualRate: 0.10 }))
    const high = computeFundAbsorptionCapacity(makeInputs({ existingAnnualRate: 0.30 }))
    expect(high.credit.capacity!).toBeLessThanOrEqual(low.credit.capacity!)
  })
})

describe('computeFundAbsorptionCapacity — grant capacity', () => {
  it('REG: a loss-making business (negative EBITDA margin) gets zero grant capacity', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ annualEbitda: -50_000 }))
    expect(r.grant.capacity).toBe(0)
    expect(r.grant.reason).toMatch(/not yet profitable/i)
  })

  it('REG: governance below 2 gets zero grant capacity regardless of profitability', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ governanceScore: 1 }))
    expect(r.grant.capacity).toBe(0)
    expect(r.grant.reason).toMatch(/governance/i)
  })

  it('REG: a profitable, governed business gets 25% of revenue scaled by production capacity, with a 70/130% band', () => {
    const r = computeFundAbsorptionCapacity(makeInputs())
    const expected = 1_200_000 * 0.25 * (80 / 100)
    expect(r.grant.capacity).toBeCloseTo(expected, 2)
    expect(r.grant.low!).toBeCloseTo(expected * 0.70, 2)
    expect(r.grant.high!).toBeCloseTo(expected * 1.30, 2)
  })

  it('REG: records completeness below 70% is flagged as an unmet condition, not silently ignored', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ recordsCompletenessPct: 40 }))
    expect(r.grant.conditions.some(c => /70%/.test(c) && /40%/.test(c))).toBe(true)
  })
})

describe('computeFundAbsorptionCapacity — equity capacity', () => {
  it('REG: a non-profitable business (NPAT <= 0) gets zero equity capacity', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ annualNpat: 0 }))
    expect(r.equity.capacity).toBe(0)
    expect(r.equity.reason).toMatch(/profitable/i)
  })

  it('REG: a profitable, stable business gets NPAT / 15% target return', () => {
    const r = computeFundAbsorptionCapacity(makeInputs())
    expect(r.equity.capacity).toBeCloseTo(120_000 / 0.15, 2)
  })

  it('REG: declining revenue trend discounts equity capacity by 40% relative to stable, all else equal', () => {
    const stable = computeFundAbsorptionCapacity(makeInputs({ revTrend: 'Stable' }))
    const declining = computeFundAbsorptionCapacity(makeInputs({ revTrend: 'Declining' }))
    expect(declining.equity.capacity!).toBeCloseTo(stable.equity.capacity! * 0.6, 2)
    expect(declining.equity.reason).toMatch(/declining/i)
  })
})

describe('computeFundAbsorptionCapacity — consignment capacity', () => {
  it('REG: no input shop unit identified returns null, not zero', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ inputShopUnit: null }))
    expect(r.consignment.capacity).toBeNull()
    expect(r.consignment.reason).toMatch(/no input shop/i)
  })

  it('REG: a negative-margin input shop gets zero consignment capacity with a repricing prerequisite', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ inputShopUnit: { annualRevenue: 600_000, annualGrossProfit: -10_000 } }))
    expect(r.consignment.capacity).toBe(0)
    expect(r.consignment.conditions.some(c => /restructure/i.test(c))).toBe(true)
  })

  it('REG: a healthy input shop gets monthly stock turnover times the cash conversion gap in months', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ cashConversionGapDays: 60 }))
    const expected = (600_000 / 12) * 2 // ccgMonths = 60/30 = 2
    expect(r.consignment.capacity).toBeCloseTo(expected, 2)
  })

  it('REG: a supplier-financed cash conversion gap floors ccgMonths at 1, not zero or negative', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ cashConversionGapDays: -30 }))
    const expected = 600_000 / 12 // ccgMonths floored to 1
    expect(r.consignment.capacity).toBeCloseTo(expected, 2)
  })
})

describe('computeFundAbsorptionCapacity — recoverable grant capacity', () => {
  it('REG: defaults to a 50/50 blend when repayableFraction is not configured, and flags the default', () => {
    const r = computeFundAbsorptionCapacity(makeInputs())
    expect(r.repayableFractionWasDefaulted).toBe(true)
    expect(r.repayableFractionUsed).toBe(0.5)
    const expected = r.grant.capacity! * 0.5 + r.credit.capacity! * 0.5
    expect(r.recoverableGrant.capacity!).toBeCloseTo(expected, 2)
  })

  it('REG: a configured repayableFraction is honoured exactly and not flagged as defaulted', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ repayableFraction: 0.25 }))
    expect(r.repayableFractionWasDefaulted).toBe(false)
    expect(r.repayableFractionUsed).toBe(0.25)
    const expected = r.grant.capacity! * 0.75 + r.credit.capacity! * 0.25
    expect(r.recoverableGrant.capacity!).toBeCloseTo(expected, 2)
  })

  it('REG: null credit capacity (insufficient §SCP data) propagates to a null recoverable grant, not a silent zero substitution', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'insufficient', stressClose_4wk: [] }))
    expect(r.credit.capacity).toBeNull()
    expect(r.recoverableGrant.capacity).toBeNull()
  })

  it('REG: a zero (not null) credit capacity -- existing cash stress -- DOES blend in as a real zero', () => {
    const r = computeFundAbsorptionCapacity(makeInputs({ stressClose_4wk: [150_000, 90_000, -5_000, 60_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000, 150_000] }))
    expect(r.credit.capacity).toBe(0)
    expect(r.recoverableGrant.capacity).not.toBeNull()
    expect(r.recoverableGrant.capacity!).toBeCloseTo(r.grant.capacity! * 0.5, 2)
  })
})

describe('computeFundAbsorptionCapacity — overall dataConfidence passthrough', () => {
  it('REG: the top-level dataConfidence matches whatever §SCP reported', () => {
    expect(computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'limited' })).dataConfidence).toBe('limited')
    expect(computeFundAbsorptionCapacity(makeInputs({ scpDataConfidence: 'reliable' })).dataConfidence).toBe('reliable')
  })
})
