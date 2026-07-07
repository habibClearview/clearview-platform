import { describe, it, expect } from 'vitest'
import { computeNPV, computeIRR, buildInvestmentCashFlows, computeCustomerGrowthSummary, annualRateToMonthlyRate, monthlyRateToAnnualRate } from '../lib/investment-metrics'

describe('computeNPV — standard discounted cash flow formula', () => {
  it('REG: a zero discount rate is just the plain sum of cash flows', () => {
    const npv = computeNPV([-1000, 300, 300, 300, 300], 0)
    expect(npv).toBe(200) // -1000 + 300*4
  })

  it('REG: matches a hand-calculable example at a real discount rate', () => {
    // -1000 at t=0, then 500 at t=1, 500 at t=2, discounted at 10%
    // NPV = -1000 + 500/1.1 + 500/1.21 = -1000 + 454.545... + 413.223... = -132.23...
    const npv = computeNPV([-1000, 500, 500], 0.10)
    expect(npv).toBeCloseTo(-132.23, 1)
  })

  it('REG: an investment with no returns at all has NPV equal to the negative investment (nothing to discount away)', () => {
    const npv = computeNPV([-1000], 0.15)
    expect(npv).toBe(-1000)
  })

  it('REG: a higher discount rate always reduces NPV for a normal positive-return investment -- future money is worth less at a higher rate', () => {
    const npvLowRate = computeNPV([-1000, 600, 600, 600], 0.05)
    const npvHighRate = computeNPV([-1000, 600, 600, 600], 0.25)
    expect(npvHighRate).toBeLessThan(npvLowRate)
  })
})

describe('computeIRR — the rate at which NPV = 0', () => {
  it('REG: a simple, well-known example -- invest 1000, get back 1100 after one year, IRR is exactly 10%', () => {
    const irr = computeIRR([-1000, 1100])
    expect(irr).not.toBeNull()
    expect(irr!).toBeCloseTo(0.10, 4)
  })

  it('REG: the computed IRR genuinely produces NPV = 0 when plugged back into computeNPV -- the actual definition of IRR, not just a plausible-looking number', () => {
    const cashFlows = [-5000, 1500, 1800, 2000, 1700]
    const irr = computeIRR(cashFlows)
    expect(irr).not.toBeNull()
    expect(computeNPV(cashFlows, irr!)).toBeCloseTo(0, 2)
  })

  it('REG: an investment with no returns at all (all outflow, no inflow) has no real IRR -- returns null, never a wrong number', () => {
    expect(computeIRR([-1000, -200, -300])).toBeNull()
  })

  it('REG: returns with no investment at all (all inflow, no outflow) also has no real IRR', () => {
    expect(computeIRR([1000, 200, 300])).toBeNull()
  })

  it('REG: a genuinely unprofitable investment (never recovers the initial outlay) has a negative IRR, still correctly solved', () => {
    const cashFlows = [-1000, 100, 100, 100]
    const irr = computeIRR(cashFlows)
    expect(irr).not.toBeNull()
    expect(irr!).toBeLessThan(0)
    expect(computeNPV(cashFlows, irr!)).toBeCloseTo(0, 2)
  })

  it('REG: a highly profitable investment (returns far exceed the outlay quickly) still converges to a correct, verifiable IRR', () => {
    const cashFlows = [-1000, 5000]
    const irr = computeIRR(cashFlows)
    expect(irr).not.toBeNull()
    expect(computeNPV(cashFlows, irr!)).toBeCloseTo(0, 2)
    expect(irr!).toBeCloseTo(4.0, 2) // 5000/1000 = 5x return in one period => (5-1) = 400% IRR
  })
})

describe('annualRateToMonthlyRate / monthlyRateToAnnualRate — matching the discount rate to the cash flow series periodicity', () => {
  it('REG: converting an annual rate to monthly and back to annual returns the original rate -- the conversion is a true inverse', () => {
    const annual = 0.15
    const monthly = annualRateToMonthlyRate(annual)
    const backToAnnual = monthlyRateToAnnualRate(monthly)
    expect(backToAnnual).toBeCloseTo(annual, 10)
  })

  it('REG: a 0% annual rate converts to a 0% monthly rate', () => {
    expect(annualRateToMonthlyRate(0)).toBe(0)
  })

  it('REG: the monthly equivalent of a 15% annual rate is meaningfully smaller than 15%/12 -- compounding, not a naive divide', () => {
    const monthly = annualRateToMonthlyRate(0.15)
    expect(monthly).toBeGreaterThan(0)
    expect(monthly).toBeLessThan(0.15 / 12) // the actual compounding bound -- catches overstatement, not just a rough sanity check
    expect(monthly).toBeLessThan(0.15 / 12 * 1.1) // sanity: in the right ballpark, not wildly different
    expect(monthly).not.toBeCloseTo(0.15 / 12, 5) // but NOT the naive division either -- must be the compounding formula
  })

  it('REG: this is the exact bug CodeRabbit caught -- applying a raw 15% annual rate per MONTH compounds to a wildly different effective annual rate than intended', () => {
    const naiveAnnualEquivalent = monthlyRateToAnnualRate(0.15) // what happens if 15% is wrongly used AS the monthly rate
    expect(naiveAnnualEquivalent).toBeGreaterThan(4) // over 400% effective annual -- exactly the over-discounting bug
    // The correct monthly rate, by contrast, compounds back to exactly 15% annual
    const correctMonthlyRate = annualRateToMonthlyRate(0.15)
    expect(monthlyRateToAnnualRate(correctMonthlyRate)).toBeCloseTo(0.15, 10)
  })

  it('REG: a monthly IRR correctly annualizes using the same compounding formula, verified against a hand-calculable example', () => {
    // A monthly return of exactly 10% compounds to (1.10)^12 - 1 = 213.8...% annually
    const annualized = monthlyRateToAnnualRate(0.10)
    expect(annualized).toBeCloseTo(Math.pow(1.10, 12) - 1, 10)
    expect(annualized).toBeCloseTo(2.138, 2)
  })
})

describe('buildInvestmentCashFlows — constructing the series NPV/IRR actually run on', () => {
  it('REG: CF[0] is the negative of the capital at risk, regardless of sign given', () => {
    const cf = buildInvestmentCashFlows(10_000_000, [1_000_000, 1_000_000], [0, 0])
    expect(cf[0]).toBe(-10_000_000)
  })

  it('REG: subsequent entries are Free Cash Flow -- Operating Cash Flow plus Investing Cash Flow (already a negative/outflow figure)', () => {
    const cf = buildInvestmentCashFlows(10_000_000, [2_000_000, 2_500_000], [-500_000, 0])
    expect(cf[1]).toBe(1_500_000) // 2,000,000 - 500,000 capex
    expect(cf[2]).toBe(2_500_000) // no capex this month
  })

  it('REG: a missing invCash entry for a given month is treated as zero, not undefined propagating through', () => {
    const cf = buildInvestmentCashFlows(10_000_000, [2_000_000], [])
    expect(cf[1]).toBe(2_000_000)
  })
})

describe('computeCustomerGrowthSummary — whole-business customer acquisition aggregation', () => {
  it('REG: sums customers acquired and cost across every event, not just one channel', () => {
    const events = [
      { cost: 500_000, customers_acquired: 50, revenue_before: 1_000_000, revenue_after: 1_500_000 },
      { cost: 300_000, customers_acquired: 20, revenue_before: 500_000, revenue_after: 700_000 },
    ]
    const summary = computeCustomerGrowthSummary(events)
    expect(summary.totalCustomersAcquired).toBe(70)
    expect(summary.totalAcquisitionCost).toBe(800_000)
    expect(summary.blendedCAC).toBeCloseTo(800_000 / 70, 2)
  })

  it('REG: blendedCAC is null (not a division-by-zero artifact like Infinity or NaN) when zero customers were acquired', () => {
    const events = [{ cost: 500_000, customers_acquired: 0, revenue_before: 0, revenue_after: 0 }]
    const summary = computeCustomerGrowthSummary(events)
    expect(summary.blendedCAC).toBeNull()
  })

  it('REG: revenue lift only counts a genuine increase, never a negative lift subtracting from the total', () => {
    const events = [
      { cost: 100_000, customers_acquired: 10, revenue_before: 1_000_000, revenue_after: 1_200_000 }, // +200,000
      { cost: 100_000, customers_acquired: 5, revenue_before: 1_000_000, revenue_after: 900_000 },     // decline, counts as 0, not -100,000
    ]
    const summary = computeCustomerGrowthSummary(events)
    expect(summary.totalRevenueLift).toBe(200_000)
  })

  it('REG: an empty events list produces a well-defined zero summary, not an error', () => {
    const summary = computeCustomerGrowthSummary([])
    expect(summary.totalCustomersAcquired).toBe(0)
    expect(summary.blendedCAC).toBeNull()
  })

  it('REG: missing fields on an event are treated as zero, not undefined propagating into NaN totals', () => {
    const events = [{}]
    const summary = computeCustomerGrowthSummary(events)
    expect(summary.totalCustomersAcquired).toBe(0)
    expect(summary.totalAcquisitionCost).toBe(0)
    expect(Number.isNaN(summary.totalRevenueLift)).toBe(false)
  })
})
