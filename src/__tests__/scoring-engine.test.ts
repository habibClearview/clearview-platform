import { describe, it, expect } from 'vitest'
import { computeScores, buildDebtSchedule, defaultCoachAssessment, dscrLabel, dscrColor, type DebtObligation } from '../lib/scoring-engine'

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
