import { describe, it, expect } from 'vitest'
import { computeScores, buildDebtSchedule, defaultCoachAssessment, dscrLabel, dscrColor, sliceDebtScheduleForRange, summarizeTradeCreditForRange, computeTradeCredit, computeScoresTimeSeries, type DebtObligation, type TradeCreditLine } from '../lib/scoring-engine'

const MONTHS = 24
const COLORS = { green: 'green', amber: 'amber', red: 'red', slate: 'slate' }

function baseScoringInputs(overrides: Record<string, any> = {}) {
  return {
    rev: Array(MONTHS).fill(1000000),
    ebitda: Array(MONTHS).fill(300000),
    cogs: Array(MONTHS).fill(400000),
    cashClose: Array(MONTHS).fill(500000),
    totalEquity: 2000000,
    totalLiabilities: 500000,
    months: MONTHS,
    assess: defaultCoachAssessment(),
    ...overrides,
  }
}

describe('Scoring Engine — DSCR: no averaging, no fabricated figures', () => {
  it('REG: with zero debt obligations, hasDebt is false and dscrMin is null', () => {
    const scores = computeScores(baseScoringInputs({ debtObligations: [] }))
    expect(scores.hasDebt).toBe(false)
    expect(scores.dscrMin).toBeNull()
  })

  it('REG: with zero debt, dscrVals contains no fabricated placeholder numbers -- every entry is null', () => {
    const scores = computeScores(baseScoringInputs({ debtObligations: [] }))
    expect(scores.dscrVals.every(v => v === null)).toBe(true)
  })

  it('REG: dscrLabel returns "N/A — No Debt" when there is no debt, never a number', () => {
    expect(dscrLabel({ hasDebt: false, dscrMin: null })).toBe('N/A — No Debt')
  })

  it('REG: with debt but drawdown beyond the plan window, no repayment is ever due -- dscrMin stays null, not a fake number', () => {
    const debtObligations: DebtObligation[] = [
      { principal: 10000000, annualRate: 0.18, tenorMonths: 12, drawdownMonth: 30, repaymentType: 'amortising' },
    ]
    const scores = computeScores(baseScoringInputs({ debtObligations }))
    expect(scores.hasDebt).toBe(true)
    expect(scores.dscrMin).toBeNull()
    expect(dscrLabel(scores)).toBe('N/A — No Repayment Due Yet')
  })

  it('REG: dscrVals only has real ratios in months where a repayment is actually due -- months before drawdown are null, not blended into an average', () => {
    // Loan drawn down at month 13, 12-month tenor, no grace -- so only months 13-24 have real debt service.
    const debtObligations: DebtObligation[] = [
      { principal: 10000000, annualRate: 0.18, tenorMonths: 12, drawdownMonth: 13, repaymentType: 'amortising' },
    ]
    const scores = computeScores(baseScoringInputs({ debtObligations }))
    // First 12 months (index 0-11): no debt service yet.
    for (let i = 0; i < 12; i++) expect(scores.dscrVals[i]).toBeNull()
    // Months 13-24 (index 12-23): real debt service, real ratio.
    for (let i = 12; i < 24; i++) expect(scores.dscrVals[i]).not.toBeNull()
  })

  it('REG: dscrMin is the minimum across real debt-service periods, never an arithmetic average', () => {
    // EBITDA varies so DSCR varies month to month; confirm dscrMin equals the actual minimum, not a mean.
    const varyingEbitda = Array(MONTHS).fill(0).map((_, i) => 200000 + i * 50000)
    const debtObligations: DebtObligation[] = [
      { principal: 5000000, annualRate: 0.18, tenorMonths: 24, drawdownMonth: 1, repaymentType: 'amortising' },
    ]
    const scores = computeScores(baseScoringInputs({ ebitda: varyingEbitda, debtObligations }))
    const realVals = scores.dscrVals.filter((v): v is number => v !== null)
    expect(scores.dscrMin).toBeCloseTo(Math.min(...realVals), 6)
    const naiveAverage = realVals.reduce((a, b) => a + b, 0) / realVals.length
    // With growing EBITDA, min must be strictly below the average -- proves this isn't secretly an average.
    expect(scores.dscrMin!).toBeLessThan(naiveAverage)
  })

  it('REG: no debt scores the same as strong coverage for Going Concern and Investment Readiness, but is never labelled with a DSCR figure', () => {
    const scores = computeScores(baseScoringInputs({ debtObligations: [] }))
    expect(scores.irDebt).toBe(5) // full marks -- no debt carries no default risk
    expect(dscrLabel(scores)).not.toMatch(/x$/) // never formatted as a ratio like "3.00x"
  })
})

describe('Scoring Engine — dscrColor', () => {
  it('REG: returns slate (neutral) when there is no debt', () => {
    expect(dscrColor({ hasDebt: false, dscrMin: null }, COLORS)).toBe('slate')
  })
  it('REG: returns slate (neutral) when debt exists but nothing is due yet', () => {
    expect(dscrColor({ hasDebt: true, dscrMin: null }, COLORS)).toBe('slate')
  })
  it('REG: returns green/amber/red based on the real dscrMin once repayment is due', () => {
    expect(dscrColor({ hasDebt: true, dscrMin: 2.0 }, COLORS)).toBe('green')
    expect(dscrColor({ hasDebt: true, dscrMin: 1.2 }, COLORS)).toBe('amber')
    expect(dscrColor({ hasDebt: true, dscrMin: 0.5 }, COLORS)).toBe('red')
  })
})

describe('Debt Schedule — repayment types', () => {
  it('REG: when tenorMonths exceeds the visible projection window, installment size is still based on the FULL tenor, not the truncated window', () => {
    // 36-month tenor, but the model only shows 24 months. Each installment
    // must still be principal/36 (~33,333), not principal/24 (~50,000) --
    // otherwise the loan is wrongly repaid faster than its actual tenor.
    const sched = buildDebtSchedule([{ principal: 1200000, tenorMonths: 36, drawdownMonth: 1, repaymentType: 'amortising' }], 24)
    const expectedInstalment = 1200000 / 36
    for (let i = 0; i < 24; i++) expect(sched.totalPrincipal[i]).toBeCloseTo(expectedInstalment, 2)
    // With only 24 of 36 installments visible, the loan must NOT be fully
    // repaid within the window -- meaningful balance should remain (~400,000).
    expect(sched.totalOutstanding[23]).toBeCloseTo(1200000 / 3, 0)
    expect(sched.totalOutstanding[23]).toBeGreaterThan(390000)
  })

  it('REG: amortising (default) spreads principal evenly across the tenor after grace', () => {
    const sched = buildDebtSchedule([{ principal: 1200000, tenorMonths: 12, drawdownMonth: 1, repaymentType: 'amortising' }], 12)
    // 12 equal principal instalments of 100,000 each.
    for (let i = 0; i < 12; i++) expect(sched.totalPrincipal[i]).toBeCloseTo(100000, 2)
    expect(sched.totalOutstanding[11]).toBeCloseTo(0, 2)
  })

  it('REG: bullet repayment keeps full principal outstanding until the final month', () => {
    const sched = buildDebtSchedule([{ principal: 1000000, tenorMonths: 6, drawdownMonth: 1, repaymentType: 'bullet' }], 6)
    for (let i = 0; i < 5; i++) expect(sched.totalPrincipal[i]).toBe(0)
    expect(sched.totalPrincipal[5]).toBeCloseTo(1000000, 2)
    expect(sched.totalOutstanding[5]).toBeCloseTo(0, 2)
  })

  it('REG: quarterly repayment only has principal due every 3rd month', () => {
    const sched = buildDebtSchedule([{ principal: 1200000, tenorMonths: 12, drawdownMonth: 1, repaymentType: 'quarterly' }], 12)
    // Due months (0-indexed within tenor): 0, 3, 6, 9 -- four instalments of 300,000 each.
    ;[0, 3, 6, 9].forEach(i => expect(sched.totalPrincipal[i]).toBeCloseTo(300000, 2))
    ;[1, 2, 4, 5, 7, 8, 10, 11].forEach(i => expect(sched.totalPrincipal[i]).toBe(0))
    expect(sched.totalOutstanding[11]).toBeCloseTo(0, 2)
  })

  it('REG: seasonal repayment only has principal due on the specified months', () => {
    const sched = buildDebtSchedule([{
      principal: 2000000, tenorMonths: 12, drawdownMonth: 1, repaymentType: 'seasonal', seasonalMonths: [6, 12],
    }], 12)
    // seasonalMonths are 1-indexed -- month 6 and month 12 -> array index 5 and 11.
    expect(sched.totalPrincipal[5]).toBeCloseTo(1000000, 2)
    expect(sched.totalPrincipal[11]).toBeCloseTo(1000000, 2)
    ;[0, 1, 2, 3, 4, 6, 7, 8, 9, 10].forEach(i => expect(sched.totalPrincipal[i]).toBe(0))
    expect(sched.totalOutstanding[11]).toBeCloseTo(0, 2)
  })

  it('REG: interest still accrues every month the loan is outstanding regardless of repayment type', () => {
    const sched = buildDebtSchedule([{
      principal: 1000000, annualRate: 0.12, tenorMonths: 12, drawdownMonth: 1, repaymentType: 'seasonal', seasonalMonths: [12],
    }], 12)
    // Full principal outstanding for 11 months before the single seasonal repayment -- interest should accrue each month.
    for (let i = 0; i < 11; i++) expect(sched.totalInterest[i]).toBeGreaterThan(0)
  })

  it('REG: a debt obligation with drawdown beyond the plan window contributes zero repayment and zero outstanding', () => {
    const sched = buildDebtSchedule([{ principal: 1000000, tenorMonths: 12, drawdownMonth: 30, repaymentType: 'amortising' }], 24)
    expect(sched.totalRepayment.every(v => v === 0)).toBe(true)
    expect(sched.totalOutstanding.every(v => v === 0)).toBe(true)
  })
})

describe('sliceDebtScheduleForRange — preserving correct debt timing when scoring one year out of a longer plan', () => {
  it('REG: the exact misalignment this function prevents -- a loan drawn down mid-YEAR-1, still being repaid by year 2, sliced correctly vs incorrectly re-derived', () => {
    // A 12-month loan drawing down in month 3 (well before the year 2
    // boundary at index 12) with no grace period -- by month 12 (start of
    // year 2), the loan is 9 months into repayment, roughly 3/4 paid down.
    const fullSchedule = buildDebtSchedule(
      [{ principal: 1_200_000, tenorMonths: 12, drawdownMonth: 3, annualRate: 0.12, repaymentType: 'amortising' }],
      24,
    )
    const year2Indices = Array.from({length: 12}, (_, i) => i + 12)
    const sliced = sliceDebtScheduleForRange(fullSchedule, year2Indices)

    // Correctly sliced: the loan is already mostly repaid, so outstanding
    // balance at the START of year 2 should be small (near the tail of a
    // 12-month tenor that started in month 3, i.e. 9 months in).
    expect(sliced.totalOutstanding[0]).toBeLessThan(1_200_000 * 0.3)

    // An INCORRECT re-derivation -- computing a fresh schedule as if month
    // 0 of the slice were the loan's actual drawdown month -- would show
    // the FULL, undiminished principal outstanding at the start instead.
    const wronglyRederived = buildDebtSchedule(
      [{ principal: 1_200_000, tenorMonths: 12, drawdownMonth: 1, annualRate: 0.12, repaymentType: 'amortising' }],
      12,
    )
    expect(wronglyRederived.totalOutstanding[0]).toBeGreaterThan(1_200_000 * 0.8)
    expect(sliced.totalOutstanding).not.toEqual(wronglyRederived.totalOutstanding)
  })

  it('REG: the sliced schedule has exactly one entry per requested month index, in the same order', () => {
    const fullSchedule = buildDebtSchedule([{ principal: 500_000, tenorMonths: 6, drawdownMonth: 1, annualRate: 0.1 }], 12)
    const sliced = sliceDebtScheduleForRange(fullSchedule, [2, 3, 4])
    expect(sliced.totalRepayment.length).toBe(3)
    expect(sliced.totalRepayment).toEqual([
      fullSchedule.totalRepayment[2], fullSchedule.totalRepayment[3], fullSchedule.totalRepayment[4],
    ])
  })

  it('REG: annualY1 on the sliced schedule reflects only the sliced range, not the full plan', () => {
    const fullSchedule = buildDebtSchedule([{ principal: 1_000_000, tenorMonths: 12, drawdownMonth: 1, annualRate: 0.12 }], 24)
    const firstYear = sliceDebtScheduleForRange(fullSchedule, Array.from({length: 12}, (_, i) => i))
    const secondYear = sliceDebtScheduleForRange(fullSchedule, Array.from({length: 12}, (_, i) => i + 12))
    expect(firstYear.annualY1).toBeGreaterThan(0) // loan is being repaid in year 1
    expect(secondYear.annualY1).toBe(0) // loan is already fully repaid by year 2 (12-month tenor)
  })

  it('REG: an out-of-range index is treated as zero rather than throwing or returning undefined', () => {
    const fullSchedule = buildDebtSchedule([], 6)
    const sliced = sliceDebtScheduleForRange(fullSchedule, [10, 11])
    expect(sliced.totalRepayment).toEqual([0, 0])
  })
})

describe('summarizeTradeCreditForRange — recomputing DPO/DSO for one year without re-simulating the running balance', () => {
  it('REG: the exact scenario this prevents -- a payable balance carried forward from a prior year is preserved, not lost by re-simulating year 2 alone', () => {
    // Large new credit received in month 0 (year 1), settled gradually --
    // by year 2 there is still a real outstanding balance carried forward.
    const lines: TradeCreditLine[] = [{
      id: 'supplier1', name: 'Input Supplier', type: 'payable',
      monthly_new: [2_000_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      monthly_settled: Array(24).fill(100_000), // pays down slowly, 100k/month
    }]
    const cogs = Array(24).fill(300_000)
    const rev = Array(24).fill(500_000)
    const full = computeTradeCredit(lines, cogs, rev, 24)

    const year2Indices = Array.from({length: 12}, (_, i) => i + 12)
    const year2Summary = summarizeTradeCreditForRange(full, cogs, rev, year2Indices)

    // By month 12, roughly 2,000,000 - 12*100,000 = 800,000 should still be
    // outstanding and carried into year 2 -- summarizeTradeCreditForRange
    // must reflect that carried-forward balance, not treat year 2 as
    // starting fresh with zero outstanding.
    expect(year2Summary.totalPayableOutstanding[0]).toBeGreaterThan(0)
    expect(year2Summary.dpo).toBeGreaterThan(0)
  })

  it('REG: DPO/DSO are computed using only the sliced range\'s cogs/revenue, not the full plan\'s', () => {
    const lines: TradeCreditLine[] = [{
      id: 'supplier1', name: 'Input Supplier', type: 'payable',
      // New credit every month, but settlement lags -- creates a genuine,
      // steady-state outstanding balance rather than a permanently zero one.
      monthly_new: Array(24).fill(150_000), monthly_settled: Array(24).fill(100_000),
    }]
    const cogs = Array(24).fill(200_000)
    const rev = Array(24).fill(400_000)
    const full = computeTradeCredit(lines, cogs, rev, 24)
    const firstYear = summarizeTradeCreditForRange(full, cogs, rev, Array.from({length: 12}, (_, i) => i))
    expect(firstYear.dpo).toBeGreaterThan(0)
  })

  it('REG: peaks (peakPayable/peakReceivable) are the max within the range, not the whole plan', () => {
    const lines: TradeCreditLine[] = [{
      id: 'supplier1', name: 'Input Supplier', type: 'payable',
      monthly_new: [5_000_000, ...Array(23).fill(0)], // one big spike in month 0 only
      monthly_settled: [0, ...Array(23).fill(1_000_000)],
    }]
    const cogs = Array(24).fill(1_000_000)
    const rev = Array(24).fill(1_000_000)
    const full = computeTradeCredit(lines, cogs, rev, 24)
    const year2Indices = Array.from({length: 12}, (_, i) => i + 12) // well after the spike has been paid down
    const year2Summary = summarizeTradeCreditForRange(full, cogs, rev, year2Indices)
    const year1Summary = summarizeTradeCreditForRange(full, cogs, rev, Array.from({length: 12}, (_, i) => i))
    expect(year1Summary.peakPayable).toBeGreaterThan(year2Summary.peakPayable)
  })

  it('REG: a range with zero cogs/revenue produces DPO/DSO of 0, not division by zero artifacts', () => {
    const full = computeTradeCredit([], [], [], 12)
    const summary = summarizeTradeCreditForRange(full, Array(12).fill(0), Array(12).fill(0), [0, 1, 2])
    expect(summary.dpo).toBe(0)
    expect(summary.dso).toBe(0)
    expect(Number.isNaN(summary.dpo)).toBe(false)
  })
})

describe('computeScoresTimeSeries — the collapsible year/month trend for Credit Risk, Going Concern, and Investment Readiness', () => {
  function makeYearGroups(monthCount: number) {
    // Simple calendar years starting Jan 1 for test clarity: 12 months per
    // year except a possible partial final year.
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

  it('REG: a brand-new prospective client with ZERO live actuals -- pure plan data -- still produces a full, real score for every year and every month, not placeholders', () => {
    // This is the exact scenario Habib described: importing a potential
    // client's plan alone, before any actual data exists, should already
    // generate a full set of usable figures.
    const months = 24
    const inputs = {
      rev: Array(months).fill(2_000_000),
      ebitda: Array(months).fill(400_000),
      cogs: Array(months).fill(1_200_000),
      cashClose: Array.from({length: months}, (_, i) => 5_000_000 + i * 300_000),
      totalEquityByMonth: Array.from({length: months}, (_, i) => 8_000_000 + i * 300_000),
      totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      debtObligations: [],
      tradeCreditLines: [],
      assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))

    expect(series.years.length).toBe(2)
    series.years.forEach(y => {
      expect(y.result.score).toBeGreaterThanOrEqual(0)
      expect(y.result.score).toBeLessThanOrEqual(100)
      expect(y.result.gcScore).toBeGreaterThanOrEqual(0)
      expect(y.result.irScore).toBeGreaterThanOrEqual(0)
      expect(Number.isNaN(y.result.score)).toBe(false)
      expect(Number.isNaN(y.result.gcScore)).toBe(false)
      expect(Number.isNaN(y.result.irScore)).toBe(false)
    })
    // Every month within every year also produces a real score
    Object.values(series.monthsByYear).flat().forEach(m => {
      expect(Number.isNaN(m.result.score)).toBe(false)
      expect(Number.isNaN(m.result.gcScore)).toBe(false)
      expect(Number.isNaN(m.result.irScore)).toBe(false)
    })
  })

  it('REG: a client with literally all-zero figures (no revenue, no costs, no cash at all entered yet) still produces well-defined scores, not NaN or crashes', () => {
    const months = 12
    const inputs = {
      rev: Array(months).fill(0), ebitda: Array(months).fill(0), cogs: Array(months).fill(0),
      cashClose: Array(months).fill(0),
      totalEquityByMonth: Array(months).fill(0), totalLiabilitiesByMonth: Array(months).fill(0),
      debtObligations: [], tradeCreditLines: [], assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    expect(series.years.length).toBe(1)
    expect(Number.isNaN(series.years[0].result.score)).toBe(false)
    expect(Number.isNaN(series.years[0].result.gcScore)).toBe(false)
    expect(Number.isNaN(series.years[0].result.irScore)).toBe(false)
  })

  it('REG: each year is scored using ONLY that year\'s own months -- year 1\'s healthy cash position does not mask a real cash gap in year 2', () => {
    const months = 24
    const inputs = {
      rev: [...Array(12).fill(5_000_000), ...Array(12).fill(500_000)], // strong year 1, weak year 2
      ebitda: [...Array(12).fill(1_500_000), ...Array(12).fill(-200_000)],
      cogs: Array(months).fill(1_000_000),
      // Year 1: cash always healthy. Year 2: genuinely goes negative some
      // months -- a real cash gap that should show up ONLY in year 2's
      // score, not be masked by year 1's healthy position.
      cashClose: [...Array(12).fill(10_000_000), ...Array(6).fill(200_000), ...Array(6).fill(-500_000)],
      totalEquityByMonth: Array(months).fill(5_000_000),
      totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      debtObligations: [], tradeCreditLines: [], assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    expect(series.years[0].result.annualEbitda).toBeGreaterThan(0)
    expect(series.years[1].result.annualEbitda).toBeLessThan(0)
    // Year 1 has zero cash gaps; year 2 has real ones -- this must be
    // reflected per-year, not blended or leaked across the boundary.
    expect(series.years[0].result.cashGaps).toBe(0)
    expect(series.years[1].result.cashGaps).toBeGreaterThan(0)
    expect(series.years[0].result.score).toBeGreaterThan(series.years[1].result.score)
  })

  it('REG: a loan drawn down in year 1 is correctly reflected as still being serviced in year 2 -- the debt schedule alignment fix actually matters end to end', () => {
    const months = 24
    const inputs = {
      rev: Array(months).fill(2_000_000), ebitda: Array(months).fill(500_000), cogs: Array(months).fill(1_000_000),
      cashClose: Array(months).fill(3_000_000),
      totalEquityByMonth: Array(months).fill(5_000_000), totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      debtObligations: [{ principal: 3_000_000, tenorMonths: 18, drawdownMonth: 3, annualRate: 0.15, repaymentType: 'amortising' }],
      tradeCreditLines: [], assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    // Year 1 (months 0-11): loan started month 3 (index 2), so most of year
    // 1 has real repayments due -> hasDebt true, dscrMin should be a real
    // number, not null.
    expect(series.years[0].result.hasDebt).toBe(true)
    expect(series.years[0].result.dscrMin).not.toBeNull()
    // Year 2 (months 12-23): an 18-month tenor starting at month 3 (index 2)
    // runs through index 19 -- still has real repayments due partway
    // through year 2, so this should ALSO show real debt service, not
    // "no debt due" (which is what an incorrectly re-derived, restarted
    // schedule for year 2 alone might wrongly show).
    expect(series.years[1].result.hasDebt).toBe(true)
    expect(series.years[1].result.dscrMin).not.toBeNull()
  })

  it('REG: monthly trailing-twelve-month scores use fewer months near the start of the plan, not a full 12-month window that reaches before month 0', () => {
    const months = 6
    const inputs = {
      rev: Array(months).fill(1_000_000), ebitda: Array(months).fill(200_000), cogs: Array(months).fill(600_000),
      cashClose: Array(months).fill(2_000_000),
      totalEquityByMonth: Array(months).fill(3_000_000), totalLiabilitiesByMonth: Array(months).fill(500_000),
      debtObligations: [], tradeCreditLines: [], assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    const monthScores = series.monthsByYear[2026]
    // The 3rd month (index 2) should use a trailing window of only 3
    // months (indices 0,1,2), not 12 -- there aren't 12 months of history
    // yet.
    expect(monthScores[2].monthIndices).toEqual([0, 1, 2])
    expect(monthScores[2].result.annualRevenue).toBe(3_000_000) // 3 months of 1,000,000, not 12
  })

  it('REG: the trailing window for a month well into a longer plan correctly uses exactly the prior 12 months, not the whole plan to date', () => {
    const months = 24
    const inputs = {
      rev: Array(months).fill(1_000_000), ebitda: Array(months).fill(200_000), cogs: Array(months).fill(600_000),
      cashClose: Array(months).fill(2_000_000),
      totalEquityByMonth: Array(months).fill(3_000_000), totalLiabilitiesByMonth: Array(months).fill(500_000),
      debtObligations: [], tradeCreditLines: [], assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))
    const monthScores = series.monthsByYear[2027] // second year, indices 12-23
    const lastMonth = monthScores[monthScores.length - 1] // index 23
    expect(lastMonth.monthIndices.length).toBe(12)
    expect(lastMonth.monthIndices).toEqual(Array.from({length: 12}, (_, i) => i + 12))
  })

  it('REG: trade credit lines are correctly reflected end to end -- a payable balance carried from year 1 into year 2 affects year 2\'s score via the exact, correctly-sliced trade credit factor, not a re-simulation from month 0', () => {
    const months = 24
    const lines: TradeCreditLine[] = [{
      id: 'supplier1', name: 'Input Supplier', type: 'payable',
      // Large new credit received early, settled very slowly -- creates a
      // real, large cash conversion gap that should show up in scoring,
      // and is still being paid down well into year 2.
      monthly_new: [3_000_000, ...Array(months - 1).fill(0)],
      monthly_settled: Array(months).fill(50_000),
    }]
    const cogs = Array(months).fill(1_000_000)
    const rev = Array(months).fill(2_000_000)
    const inputs = {
      rev, ebitda: Array(months).fill(400_000), cogs,
      cashClose: Array(months).fill(3_000_000),
      totalEquityByMonth: Array(months).fill(5_000_000), totalLiabilitiesByMonth: Array(months).fill(1_000_000),
      debtObligations: [], tradeCreditLines: lines, assess: defaultCoachAssessment(),
    }
    const series = computeScoresTimeSeries(inputs, makeYearGroups(months), makeMonthLabels(months))

    // Independently compute what year 2's DPO MUST be -- correctly sliced
    // from the full-plan simulation, never re-derived from month 0 of a
    // slice. This is the exact value the previous, too-weak "dpo > 0"
    // assertion would have passed under EITHER the correct behavior or
    // the real bug this was meant to catch (computeScores silently
    // ignoring precomputedTradeCredit entirely) -- asserting the precise
    // figure is what actually distinguishes them.
    const year2Indices = Array.from({length: 12}, (_, i) => i + 12)
    const fullTradeCredit = computeTradeCredit(lines, cogs, rev, months)
    const expectedYear2Summary = summarizeTradeCreditForRange(fullTradeCredit, cogs, rev, year2Indices)

    expect(series.years[0].result.tradeCredit.dpo).toBeGreaterThan(0)
    expect(series.years[1].result.tradeCredit.dpo).toBeCloseTo(expectedYear2Summary.dpo, 6)
    expect(series.years[1].result.tradeCredit.peakPayable).toBeCloseTo(expectedYear2Summary.peakPayable, 6)
  })
})
