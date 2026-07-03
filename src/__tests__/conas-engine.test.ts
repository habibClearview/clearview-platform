import { describe, it, expect } from 'vitest'
import { runCONASModel, defaultCONASInputs, MONTHS } from '../lib/conas-engine'

function makeInputs(overrides: Record<string, any> = {}) {
  const base = defaultCONASInputs()
  return { ...base, ...overrides }
}

function expectBalanceSheetBalances(result: ReturnType<typeof runCONASModel>) {
  result.bs.totalAssets.forEach((assets: number, i: number) => {
    const equity = result.bs.totalEquityAndLiabilities[i]
    expect(Math.abs(assets - equity)).toBeLessThan(1)
  })
}

describe('CONAS Engine — Balance Sheet Integrity', () => {
  it('REG: balance sheet balances with default (no trade credit, no loan, no spend requests)', () => {
    const result = runCONASModel(makeInputs())
    expectBalanceSheetBalances(result)
  })

  it('REG: balance sheet still balances with an active payable trade credit line', () => {
    const result = runCONASModel(makeInputs({
      tradeCreditLines: [{
        id: 'tc1', name: 'Input Supplier', type: 'payable',
        monthlyNew: Array(MONTHS).fill(2_000_000),
        monthlySettled: Array(MONTHS).fill(1_000_000),
      }],
    }))
    expectBalanceSheetBalances(result)
    expect(result.bs.accountsPayable[MONTHS - 1]).toBeGreaterThan(0)
  })

  it('REG: balance sheet still balances with an active receivable trade credit line', () => {
    const result = runCONASModel(makeInputs({
      tradeCreditLines: [{
        id: 'tc1', name: 'Buyer Credit', type: 'receivable',
        monthlyNew: Array(MONTHS).fill(1_500_000),
        monthlySettled: Array(MONTHS).fill(800_000),
      }],
    }))
    expectBalanceSheetBalances(result)
    expect(result.bs.accountsReceivable[MONTHS - 1]).toBeGreaterThan(0)
  })

  it('REG: balance sheet balances and loan liability amortizes down with an active bank loan', () => {
    const inputs = makeInputs()
    inputs.capitalStructure.bankLoan = 12_000_000
    inputs.capitalStructure.loanTenorYears = 1 // fits within the 12-month season window
    const result = runCONASModel(inputs)
    expectBalanceSheetBalances(result)
    // Liability should decline as principal is repaid, not sit flat all season
    expect(result.bs.loanLiability[6]).toBeLessThan(result.bs.loanLiability[0])
    // Fully repaid by month 12 (1-year tenor)
    expect(result.bs.loanLiability[11]).toBe(0)
  })

  it('REG: loan interest is deducted before tax (reduces npat vs no-loan case)', () => {
    const withoutLoan = runCONASModel(makeInputs())
    const inputs = makeInputs()
    inputs.capitalStructure.bankLoan = 12_000_000
    const withLoan = runCONASModel(inputs)
    // Month 1 interest at 18%/yr on 12M = 180,000
    expect(withLoan.con.interest[0]).toBeCloseTo(180_000, 0)
    expect(withLoan.con.npat[0]).toBeLessThan(withoutLoan.con.npat[0])
    // npat should match an independent reconstruction from ebitda and interest
    // (tax shield only applies if nbt is actually positive that month -- this
    // doesn't assume profitability, just checks the formula is applied correctly)
    const nbtExpected = withLoan.con.ebitda[0] - withLoan.con.interest[0]
    const taxExpected = nbtExpected > 0 ? nbtExpected * 0.30 : 0
    expect(withLoan.con.npat[0]).toBeCloseTo(nbtExpected - taxExpected, 0)
  })

  it('REG: loan principal repayment reduces financing cash flow but not npat', () => {
    const inputs = makeInputs()
    inputs.capitalStructure.bankLoan = 12_000_000
    const result = runCONASModel(inputs)
    const principalM1 = result.debtSchedule.totalPrincipal[1]
    expect(principalM1).toBeGreaterThan(0)
    // Principal repayment shows up directly in financing cash flow as an
    // outflow (checked against cf.finCash directly, not re-derived from
    // other engine fields)
    expect(result.cf.finCash[1]).toBeCloseTo(-principalM1, 0)
    // npat should match a reconstruction from ebitda and interest alone --
    // if principal had leaked into the P&L, this independent reconstruction
    // (which never references principal) would not match the engine's npat
    const nbtExpected = result.con.ebitda[1] - result.con.interest[1]
    const taxExpected = nbtExpected > 0 ? nbtExpected * 0.30 : 0
    const npatExpected = nbtExpected - taxExpected
    expect(result.con.npat[1]).toBeCloseTo(npatExpected, 0)
  })

  it('REG: approved spending request reduces both cash and npat by exactly the approved amount (not double-counted)', () => {
    const withoutSpend = runCONASModel(makeInputs())
    const withSpend = runCONASModel(makeInputs({
      spendingRequests: [{
        id: 'sr1', requestedBy: 'CEO', description: 'Emergency repair',
        unitId: 'shop_1', category: 'direct_opex', month: 2,
        amount: 3_000_000, status: 'approved', ceoNote: '', createdAt: '', resolvedAt: '',
      }],
    }))
    expectBalanceSheetBalances(withSpend)
    // npat in the spend month should drop by exactly the approved amount
    expect(withoutSpend.con.npat[2] - withSpend.con.npat[2]).toBeCloseTo(3_000_000, 0)
    // Cash by year-end should drop by exactly the approved amount too --
    // previously this only hit cash (2x once the npat fix was added, 1x before
    // it), never matching the single hit to equity.
    expect(withoutSpend.cf.close[11] - withSpend.cf.close[11]).toBeCloseTo(3_000_000, 0)
  })

  it('REG: a declined spending request has no effect on cash or npat', () => {
    const withoutSpend = runCONASModel(makeInputs())
    const declined = runCONASModel(makeInputs({
      spendingRequests: [{
        id: 'sr1', requestedBy: 'CEO', description: 'Rejected request',
        unitId: 'shop_1', category: 'direct_opex', month: 2,
        amount: 3_000_000, status: 'declined', ceoNote: '', createdAt: '', resolvedAt: '',
      }],
    }))
    expect(declined.cf.close[11]).toBe(withoutSpend.cf.close[11])
    expect(declined.con.npat[2]).toBe(withoutSpend.con.npat[2])
  })
})
