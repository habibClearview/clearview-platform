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

  it('REG: balance sheet still balances with an active bank loan (liability stays flat until debt service is wired into cash flow)', () => {
    const inputs = makeInputs()
    inputs.capitalStructure.bankLoan = 12_000_000
    const result = runCONASModel(inputs)
    expectBalanceSheetBalances(result)
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
