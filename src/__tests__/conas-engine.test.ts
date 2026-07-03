import { describe, it, expect } from 'vitest'
import { runCONASModel, defaultCONASInputs, MONTHS, type PlanLine } from '../lib/conas-engine'

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

describe('CONAS Engine — Spread & Service-Fee Revenue Lines', () => {
  function withExtraLine(unitId: string, line: PlanLine) {
    return makeInputs({
      units: defaultCONASInputs().units.map(u =>
        u.id !== unitId ? u : { ...u, lines: [...u.lines, line] }
      ),
    })
  }

  it('REG: spread line revenue is sell price x volume (gross sale value), not net margin', () => {
    const spreadLine: PlanLine = {
      id: 'test_spread', name: 'Test Spread', category: 'revenue', lineType: 'spread',
      buyPrice: Array(MONTHS).fill(1000), sellPrice: Array(MONTHS).fill(1500), volume: Array(MONTHS).fill(100),
      monthlyPlan: Array(MONTHS).fill(0), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const withSpread = runCONASModel(withExtraLine('shop_1', spreadLine))
    const baseline = runCONASModel(makeInputs())
    // Revenue should increase by sellPrice x volume = 1500 x 100 = 150,000 per month.
    expect(withSpread.unitPL['shop_1'].rev[0] - baseline.unitPL['shop_1'].rev[0]).toBeCloseTo(150000, 0)
  })

  it('REG: spread line buy cost is booked as cost of sales, separate from revenue', () => {
    const spreadLine: PlanLine = {
      id: 'test_spread', name: 'Test Spread', category: 'revenue', lineType: 'spread',
      buyPrice: Array(MONTHS).fill(1000), sellPrice: Array(MONTHS).fill(1500), volume: Array(MONTHS).fill(100),
      monthlyPlan: Array(MONTHS).fill(0), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const withSpread = runCONASModel(withExtraLine('shop_1', spreadLine))
    const baseline = runCONASModel(makeInputs())
    // Cost of sales should increase by buyPrice x volume = 1000 x 100 = 100,000 per month.
    expect(withSpread.unitPL['shop_1'].cogs[0] - baseline.unitPL['shop_1'].cogs[0]).toBeCloseTo(100000, 0)
    // Gross profit therefore increases by exactly the spread: (1500-1000) x 100 = 50,000.
    expect(withSpread.unitPL['shop_1'].gp[0] - baseline.unitPL['shop_1'].gp[0]).toBeCloseTo(50000, 0)
  })

  it('REG: spreadAnalysis reports the correct spread per unit and total spread', () => {
    const spreadLine: PlanLine = {
      id: 'test_spread', name: 'Test Spread', category: 'revenue', lineType: 'spread',
      buyPrice: Array(MONTHS).fill(1000), sellPrice: Array(MONTHS).fill(1500), volume: Array(MONTHS).fill(100),
      monthlyPlan: Array(MONTHS).fill(0), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const result = runCONASModel(withExtraLine('shop_1', spreadLine))
    const analysis = result.unitPL['shop_1'].spreadAnalysis.find(a => a.lineId === 'test_spread')
    expect(analysis).toBeDefined()
    expect(analysis!.spreadPerUnit[0]).toBeCloseTo(500, 0)
    expect(analysis!.totalSpread[0]).toBeCloseTo(50000, 0)
  })

  it('REG: service_fee line revenue is fee x engagements, cost is cost x engagements', () => {
    const serviceLine: PlanLine = {
      id: 'test_service', name: 'Test Service', category: 'revenue', lineType: 'service_fee',
      feePerEngagement: Array(MONTHS).fill(50000), costPerEngagement: Array(MONTHS).fill(20000), engagements: Array(MONTHS).fill(10),
      monthlyPlan: Array(MONTHS).fill(0), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const withService = runCONASModel(withExtraLine('shop_1', serviceLine))
    const baseline = runCONASModel(makeInputs())
    expect(withService.unitPL['shop_1'].rev[0] - baseline.unitPL['shop_1'].rev[0]).toBeCloseTo(500000, 0)
    expect(withService.unitPL['shop_1'].cogs[0] - baseline.unitPL['shop_1'].cogs[0]).toBeCloseTo(200000, 0)
  })

  it('REG: a standard line (no lineType, or lineType "standard") behaves exactly as before -- monthlyPlan used directly', () => {
    const standardLine: PlanLine = {
      id: 'test_standard', name: 'Test Standard', category: 'revenue',
      monthlyPlan: Array(MONTHS).fill(75000), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const withStandard = runCONASModel(withExtraLine('shop_1', standardLine))
    const baseline = runCONASModel(makeInputs())
    expect(withStandard.unitPL['shop_1'].rev[0] - baseline.unitPL['shop_1'].rev[0]).toBeCloseTo(75000, 0)
  })

  it('REG: balance sheet still balances with spread and service-fee lines present', () => {
    const spreadLine: PlanLine = {
      id: 'test_spread', name: 'Test Spread', category: 'revenue', lineType: 'spread',
      buyPrice: Array(MONTHS).fill(1000), sellPrice: Array(MONTHS).fill(1500), volume: Array(MONTHS).fill(100),
      monthlyPlan: Array(MONTHS).fill(0), monthlyActual: Array(MONTHS).fill(null),
      actualStatus: Array(MONTHS).fill('draft'), rejectionNote: Array(MONTHS).fill(''), isShared: false,
    }
    const result = runCONASModel(withExtraLine('shop_1', spreadLine))
    expectBalanceSheetBalances(result)
  })
})
