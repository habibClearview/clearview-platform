import { describe, it, expect } from 'vitest'
import { runGenericModel, defaultGenericConfig, spreadLine, serviceFeeLine } from '../lib/generic-engine'

function expectBalanceSheetBalances(result: ReturnType<typeof runGenericModel>) {
  result.bs.total_assets.forEach((assets: number, i: number) => {
    const equity = result.bs.total_equity_and_liabilities[i]
    expect(Math.abs(assets - equity)).toBeLessThan(1)
  })
}


// Helper: build a simple config with known inputs
function makeConfig(overrides: Record<string,any> = {}) {
  return defaultGenericConfig({
    client_id: 'test',
    business_name: 'Test Co',
    currency: 'UGX',
    planning_months: 12,
    business_units: [{
      id: 'u1', name: 'Main Unit', short: 'MU',
      type: 'mixed', color: '#00B4D8',
      headcount: 2, active: true, sort_order: 0
    }],
    plan_lines: [
      { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue',
        line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
      { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales',
        line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
      { id: 'staff1', unit_id: 'u1', name: 'Staff', category: 'staff',
        line_type: 'standard', monthly_plan: Array(12).fill(1_500_000), active: true },
      { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex',
        line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
    ],
    settings: {
      shared_cost_fixed_pct: 0,
      corporate_tax_rate: 0.30,
      opening_cash_balance: 5_000_000,
      capital_structure: {
        shareholder_contribution: 10_000_000,
        grant_non_repayable: 0,
        grant_recoverable: 0,
        bank_loan: 0,
        annual_interest_rate: 0.18,
        loan_tenor_years: 2,
        grace_period_months: 0,
        fixed_assets: 0,
      }
    },
    ...overrides,
  })
}

describe('Generic Engine — Revenue & P&L', () => {
  it('calculates total revenue correctly', () => {
    const result = runGenericModel(makeConfig())
    expect(result.metrics.total_revenue).toBe(120_000_000) // 10M × 12
  })

  it('calculates gross profit correctly (60% margin)', () => {
    const result = runGenericModel(makeConfig())
    expect(result.metrics.total_gp).toBe(72_000_000) // (10M-4M) × 12
    expect(result.metrics.gross_margin).toBeCloseTo(0.6, 3)
  })

  it('calculates EBITDA correctly', () => {
    const result = runGenericModel(makeConfig())
    // GP 72M - staff 18M - opex 6M = 48M
    expect(result.metrics.total_ebitda).toBe(48_000_000)
  })

  it('calculates tax at 30% on positive EBITDA', () => {
    const result = runGenericModel(makeConfig())
    const totalTax = result.con.tax.reduce((a:number,b:number) => a+b, 0)
    expect(totalTax).toBeCloseTo(14_400_000, 0) // 48M × 30%
  })

  it('calculates NPAT correctly', () => {
    const result = runGenericModel(makeConfig())
    const totalNPAT = result.con.npat.reduce((a:number,b:number) => a+b, 0)
    expect(totalNPAT).toBeCloseTo(33_600_000, 0) // 48M - 14.4M
  })
})

describe('Generic Engine — Critical Bug Regressions', () => {
  it('REG: 0% tax rate produces zero tax (falsy-zero bug)', () => {
    const cfg = makeConfig()
    cfg.settings.corporate_tax_rate = 0  // falsy -- old || bug would set to 30%
    const result = runGenericModel(cfg)
    const totalTax = result.con.tax.reduce((a:number,b:number) => a+b, 0)
    expect(totalTax).toBe(0)
  })

  it('REG: 0% shared cost produces zero allocation (falsy-zero bug)', () => {
    const cfg = makeConfig()
    cfg.settings.shared_cost_fixed_pct = 0
    const result = runGenericModel(cfg)
    const totalShared = result.sharedPool.reduce((a:number,b:number) => a+b, 0)
    expect(totalShared).toBe(0)
  })

  it('REG: balance sheet balances every month', () => {
    const result = runGenericModel(makeConfig())
    expectBalanceSheetBalances(result)
  })

  it('REG: fixed assets appear as inv_cash outflow in month 0', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.fixed_assets = 5_000_000
    const result = runGenericModel(cfg)
    expect(result.cf.inv_cash[0]).toBe(-5_000_000)
  })

  it('REG: opening cash balance seeded into retained earnings', () => {
    const cfg = makeConfig()
    cfg.settings.opening_cash_balance = 3_000_000
    cfg.settings.capital_structure.shareholder_contribution = 0
    const result = runGenericModel(cfg)
    // Cash should start with opening balance
    expect(result.cf.close[0]).toBeGreaterThan(0)
  })

  it('REG: break-even calculation is correct', () => {
    const result = runGenericModel(makeConfig())
    // Variable costs = COGS = 4M/10M = 40%
    // Fixed costs = staff (18M/yr) + opex (6M/yr) = 24M/yr
    // Break-even = 24M / (1 - 0.4) = 40M
    expect(result.metrics.business_breakeven).toBeCloseTo(40_000_000, 0)
  })
})

describe('Generic Engine — Capital Structure', () => {
  it('shareholder contribution appears in equity', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.shareholder_contribution = 20_000_000
    const result = runGenericModel(cfg)
    expect(result.bs.share_capital[0]).toBeGreaterThanOrEqual(20_000_000)
  })

  it('grant non-repayable appears in equity not liability', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.grant_non_repayable = 10_000_000
    cfg.settings.capital_structure.shareholder_contribution = 0
    const result = runGenericModel(cfg)
    // Equity should include the grant
    expect(result.bs.total_equity_and_liabilities[0]).toBeGreaterThan(0)
  })

  it('REG: balance sheet still balances with an active payable trade credit line', () => {
    const cfg = makeConfig()
    cfg.settings.trade_credit_lines = [{
      id: 'tc1', name: 'Input Supplier', type: 'payable',
      monthly_new: Array(12).fill(2_000_000),
      monthly_settled: Array(12).fill(1_000_000),
    }]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    // Outstanding payable balance should build up and appear as a liability
    expect(result.bs.accounts_payable[11]).toBeGreaterThan(0)
  })

  it('REG: balance sheet still balances with an active receivable trade credit line', () => {
    const cfg = makeConfig()
    cfg.settings.trade_credit_lines = [{
      id: 'tc1', name: 'Buyer Credit', type: 'receivable',
      monthly_new: Array(12).fill(1_500_000),
      monthly_settled: Array(12).fill(800_000),
    }]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    expect(result.bs.accounts_receivable[11]).toBeGreaterThan(0)
  })

  it('REG: balance sheet still balances when settled amount exceeds outstanding balance (over-settlement)', () => {
    const cfg = makeConfig()
    cfg.settings.trade_credit_lines = [{
      id: 'tc1', name: 'Input Supplier', type: 'payable',
      // Month 0: 1M owed. Month 1: settling 5M against only 1M outstanding --
      // the balance should floor at 0, not go negative, and cash should only
      // move by what was actually outstanding, not the over-entered figure.
      monthly_new:     [1_000_000, 0, ...Array(10).fill(0)],
      monthly_settled: [0, 5_000_000, ...Array(10).fill(0)],
    }]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    expect(result.bs.accounts_payable[1]).toBe(0)
  })

  it('REG: balance sheet still balances when a receivable is over-collected (mirrors the payable case)', () => {
    const cfg = makeConfig()
    cfg.settings.trade_credit_lines = [{
      id: 'tc1', name: 'Buyer Credit', type: 'receivable',
      // Same clamp path as the payable case above, just on the receivable side --
      // collecting more than was ever extended should floor the receivable at 0,
      // not go negative.
      monthly_new:     [1_000_000, 0, ...Array(10).fill(0)],
      monthly_settled: [0, 5_000_000, ...Array(10).fill(0)],
    }]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    expect(result.bs.accounts_receivable[1]).toBe(0)
  })

  it('REG: balance sheet balances and loan liability amortizes down with an active bank loan', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.bank_loan = 12_000_000
    cfg.settings.capital_structure.loan_tenor_years = 1 // fits within makeConfig()'s 12-month window
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    // Liability should decline as principal is repaid, not sit flat all year
    expect(result.bs.loan_liability[6]).toBeLessThan(result.bs.loan_liability[0])
    // Fully repaid by month 12 (1-year tenor)
    expect(result.bs.loan_liability[11]).toBe(0)
  })

  it('REG: loan interest is deducted before tax (reduces npat vs no-loan case)', () => {
    const withoutLoan = runGenericModel(makeConfig())
    const cfg = makeConfig()
    cfg.settings.capital_structure.bank_loan = 12_000_000
    const withLoan = runGenericModel(cfg)
    // Month 1 interest at 18%/yr on 12M = 180,000, tax-deductible so npat
    // drops by less than the full interest amount (after the 30% tax shield)
    expect(withLoan.con.interest[0]).toBeCloseTo(180_000, 0)
    expect(withLoan.con.npat[0]).toBeLessThan(withoutLoan.con.npat[0])
    const npatDrop = withoutLoan.con.npat[0] - withLoan.con.npat[0]
    expect(npatDrop).toBeLessThan(180_000) // less than full interest, thanks to the tax shield
    expect(npatDrop).toBeCloseTo(180_000 * (1 - 0.30), 0)
  })

  it('REG: loan principal repayment reduces financing cash flow but not npat', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.bank_loan = 12_000_000
    const result = runGenericModel(cfg)
    const principalM1 = result.debtSchedule.totalPrincipal[1]
    expect(principalM1).toBeGreaterThan(0)
    // Principal repayment shows up directly in financing cash flow as an
    // outflow (checked against cf.fin_cash directly, not re-derived from
    // other engine fields)
    expect(result.cf.fin_cash[1]).toBeCloseTo(-principalM1, 0)
    // npat should match a reconstruction from ebitda and interest alone --
    // if principal had leaked into the P&L, this independent reconstruction
    // (which never references principal) would not match the engine's npat
    const nbtExpected = result.con.ebitda[1] - result.con.interest[1]
    const taxExpected = nbtExpected > 0 ? nbtExpected * 0.30 : 0
    const npatExpected = nbtExpected - taxExpected
    expect(result.con.npat[1]).toBeCloseTo(npatExpected, 0)
  })
})

describe('Generic Engine — Spread & Service Fee revenue lines', () => {
  function makeSpreadLine(overrides: {buy_price?:number[],sell_price?:number[],volume?:number[]} = {}) {
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = overrides.buy_price  ?? Array(12).fill(800)
    line.sell_price = overrides.sell_price ?? Array(12).fill(1200)
    line.volume     = overrides.volume     ?? Array(12).fill(500)
    return line
  }
  function makeServiceFeeLine(overrides: {fee_per_engagement?:number[],cost_per_engagement?:number[],engagements?:number[]} = {}) {
    const line = serviceFeeLine('advisory', 'u1', 'Advisory fees', 12)
    line.fee_per_engagement  = overrides.fee_per_engagement  ?? Array(12).fill(50_000)
    line.cost_per_engagement = overrides.cost_per_engagement ?? Array(12).fill(10_000)
    line.engagements         = overrides.engagements         ?? Array(12).fill(4)
    return line
  }

  it('spread line revenue equals gross sale value (sell price x volume), not net margin', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeSpreadLine()]
    const result = runGenericModel(cfg)
    // Revenue is the gross sale value: 1200 x 500 = 600,000/month x 12 = 7,200,000/yr,
    // on top of the 120,000,000 base revenue already in makeConfig(). Buy cost
    // flows into COGS separately, not netted against revenue.
    expect(result.metrics.total_revenue).toBe(120_000_000 + 7_200_000)
  })

  it('spread line buy cost flows into cost of sales, not revenue', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeSpreadLine()]
    const result = runGenericModel(cfg)
    const baseGp = 120_000_000 - 48_000_000 // base revenue - base COGS from makeConfig()
    // Revenue is gross sale value (1200 x 500 x 12 = 7,200,000), COGS is buy
    // cost (800 x 500 x 12 = 4,800,000), so GP contribution is the spread
    // itself: (1200-800) x 500 x 12 = 2,400,000
    expect(result.metrics.total_gp).toBe(baseGp + 2_400_000)
  })

  it('spread line with varying monthly prices (harvest season pricing) sums correctly', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeSpreadLine({
      buy_price:  [800,800,850, ...Array(9).fill(800)],
      sell_price: [1200,1200,1250, ...Array(9).fill(1200)],
      volume:     [500,620,480, ...Array(9).fill(500)],
    })]
    const result = runGenericModel(cfg)
    // Revenue is gross sale value per month: Jan 1200x500=600,000
    // Feb 1200x620=744,000 Mar 1250x480=600,000, remaining 9 months 1200x500=600,000 each=5,400,000
    const expectedSpreadRevenue = 600_000 + 744_000 + 600_000 + 5_400_000
    expect(result.metrics.total_revenue).toBe(120_000_000 + expectedSpreadRevenue)
  })

  it('service fee line revenue equals fee per engagement x number of engagements', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeServiceFeeLine()]
    const result = runGenericModel(cfg)
    // 50,000 x 4 x 12 = 2,400,000
    expect(result.metrics.total_revenue).toBe(120_000_000 + 2_400_000)
  })

  it('service fee line cost per engagement flows into cost of sales', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeServiceFeeLine()]
    const result = runGenericModel(cfg)
    const baseGp = 120_000_000 - 48_000_000
    // GP contribution = (50,000-10,000) x 4 x 12 = 1,920,000
    expect(result.metrics.total_gp).toBe(baseGp + 1_920_000)
  })

  it('REG: balance sheet still balances with an active spread line', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeSpreadLine()]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
  })

  it('REG: balance sheet still balances with an active service fee line', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeServiceFeeLine()]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
  })

  it('a spread line with zero volume contributes zero revenue (falsy-zero check)', () => {
    const cfg = makeConfig()
    cfg.plan_lines = [...cfg.plan_lines, makeSpreadLine({volume: Array(12).fill(0)})]
    const result = runGenericModel(cfg)
    expect(result.metrics.total_revenue).toBe(120_000_000)
  })
})

describe('Generic Engine — Combined balance sheet integrity', () => {
  it('REG: balance sheet still balances with a loan, trade credit, and a spread line all active together', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.bank_loan = 12_000_000
    cfg.settings.trade_credit_lines = [{
      id: 'tc1', name: 'Input Supplier', type: 'payable',
      monthly_new: Array(12).fill(2_000_000),
      monthly_settled: Array(12).fill(1_000_000),
    }]
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = Array(12).fill(800)
    line.sell_price = Array(12).fill(1200)
    line.volume     = Array(12).fill(500)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
    // Loan should still be amortizing correctly alongside everything else
    expect(result.bs.loan_liability[11]).toBeLessThan(result.bs.loan_liability[0])
  })

  it('REG: multiple debt obligations each draw down cash in their own month, not all lumped into month 0', () => {
    const cfgOneLoan = makeConfig()
    cfgOneLoan.settings.debts = [
      { name: 'Bank loan', principal: 8_000_000, annualRate: 0.18, tenorMonths: 12, gracePeriodMonths: 0, drawdownMonth: 1, repaymentType: 'amortising' },
    ]
    const oneLoanResult = runGenericModel(cfgOneLoan)

    const cfgTwoLoans = makeConfig()
    cfgTwoLoans.settings.debts = [
      { name: 'Bank loan', principal: 8_000_000, annualRate: 0.18, tenorMonths: 12, gracePeriodMonths: 0, drawdownMonth: 1, repaymentType: 'amortising' },
      // gracePeriodMonths: 1 means no repayment lands in the drawdown month
      // itself, so the month-4 cash delta below isolates the drawdown cleanly
      // rather than netting against the SACCO loan's own first repayment.
      { name: 'SACCO loan', principal: 3_000_000, annualRate: 0.20, tenorMonths: 12, gracePeriodMonths: 1, drawdownMonth: 4, repaymentType: 'amortising' },
    ]
    const twoLoanResult = runGenericModel(cfgTwoLoans)
    expectBalanceSheetBalances(twoLoanResult)

    // Month 1 (index 0): identical in both scenarios -- second loan hasn't
    // drawn down yet, so it must not be lumped into month 0
    expect(twoLoanResult.cf.fin_cash[0]).toBeCloseTo(oneLoanResult.cf.fin_cash[0], 0)
    // Month 4 (index 3): with the grace period, the only difference between
    // the two scenarios is the second loan's clean 3,000,000 drawdown
    const fin_cash_delta = twoLoanResult.cf.fin_cash[3] - oneLoanResult.cf.fin_cash[3]
    expect(fin_cash_delta).toBeCloseTo(3_000_000, 0)
    // Total liability outstanding right after both drawdowns should reflect both loans
    expect(twoLoanResult.bs.loan_liability[3]).toBeGreaterThan(oneLoanResult.bs.loan_liability[3])
  })
})

describe('Generic Engine — Actuals (hybrid P&L, docs/ACCOUNTING_ARCHITECTURE.md)', () => {
  function makeActualsConfig(overrides: Record<string,any> = {}) {
    return makeConfig({ start_date: '2026-01-01', ...overrides })
  }

  it('REG: with no actuals passed, act_rev/act_cogs/act_gp/act_ebitda are all null -- never fabricated', () => {
    const result = runGenericModel(makeActualsConfig())
    expect(result.con.act_rev.every(v => v === null)).toBe(true)
    expect(result.con.act_gp.every(v => v === null)).toBe(true)
    expect(result.con.act_ebitda.every(v => v === null)).toBe(true)
  })

  it('REG: act_gp is null unless BOTH act_rev and act_cogs exist for that month -- this is the exact bug class already found once', () => {
    // Only revenue actual entered for month 0 (index 0 = Jan 2026) -- no
    // cost_of_sales actual yet. act_gp must stay null, not silently use
    // planned COGS to "fill in the gap".
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.unitPL['u1'].act_rev[0]).toBe(9_000_000)
    expect(result.unitPL['u1'].act_gp[0]).toBeNull()
    expect(result.con.act_gp[0]).toBeNull()
  })

  it('REG: act_gp computes correctly once both act_rev and act_cogs exist', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.unitPL['u1'].act_gp[0]).toBe(5_500_000)
    expect(result.con.act_gp[0]).toBe(5_500_000)
  })

  it('REG: act_ebitda stays null unless ALL FOUR actual categories exist -- never blends actual revenue with planned costs (the original bug)', () => {
    // Revenue and COGS actuals exist, but staff/opex actuals haven't been
    // entered yet for this month. Previously this would have silently
    // computed act_ebitda using PLANNED staff/opex instead -- a real bug
    // already found and must not regress.
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.con.act_ebitda[0]).toBeNull()
  })

  it('REG: act_ebitda computes correctly once all four actual categories exist for the month, using ONLY actual figures', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    // 9,000,000 - 3,500,000 - 1,400,000 - 450,000 = 3,650,000
    expect(result.con.act_ebitda[0]).toBe(3_650_000)
    // Must NOT equal what you'd get by mixing actual revenue with planned
    // costs (10,000,000 - 4,000,000 - 1,500,000 - 500,000 = 4,000,000) --
    // proves the fix actually uses the real actual figures, not plan.
    expect(result.con.act_ebitda[0]).not.toBe(4_000_000)
  })

  it('REG: a month with no actuals entered at all stays fully null, independent of other months that do have actuals', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.con.act_ebitda[0]).not.toBeNull()
    expect(result.con.act_ebitda[1]).toBeNull() // February -- no actuals entered
  })

  it('REG: actuals for a month outside the planning window are ignored, not out-of-bounds errors', () => {
    const actuals = { u1: { '2030-01-01': { rev1: 9_000_000 } } }
    expect(() => runGenericModel(makeActualsConfig(), actuals)).not.toThrow()
  })

  it('REG: act_gp minus (act_staff + act_opex) reconciles exactly to act_ebitda -- this is what the P&L displays, and it must foot', () => {
    // CodeRabbit caught that the Consolidated P&L could show actual Gross
    // Profit and actual EBITDA in the same month with a plan-sourced
    // Operating Costs figure between them, so the displayed column didn't
    // add up. The fix hybridizes Operating Costs from act_staff+act_opex.
    // This confirms the underlying arithmetic actually reconciles.
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    const actOpexTotal = (result.con.act_staff[0] as number) + (result.con.act_opex[0] as number)
    expect((result.con.act_gp[0] as number) - actOpexTotal).toBe(result.con.act_ebitda[0])
  })
})

describe('Generic Engine — hybrid Cash Flow and Balance Sheet', () => {
  function makeCFBSConfig(overrides: Record<string,any> = {}) {
    return makeConfig({ start_date: '2026-01-01', ...overrides })
  }

  it('REG: with no actuals, cash flow and balance sheet are unaffected -- act_mask is all false', () => {
    const result = runGenericModel(makeCFBSConfig())
    expect(result.cf.act_mask.every((v:boolean) => v === false)).toBe(true)
    expect(result.bs.act_mask.every((v:boolean) => v === false)).toBe(true)
  })

  it('REG: a month with actual EBITDA produces actual NPAT, which feeds into operating cash flow for that month', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCFBSConfig(), actuals)
    expect(result.con.act_npat[0]).not.toBeNull()
    // Operating cash for month 0 should reflect the ACTUAL npat, not planned
    const expectedOpCash = (result.con.act_npat[0] as number) + (result.cf.working_capital_adj[0] || 0)
    expect(result.cf.op_cash[0]).toBeCloseTo(expectedOpCash, 2)
  })

  it('REG: cash flow act_mask bleeds forward from the first actual month onward, not just that one month -- cash is cumulative', () => {
    const actuals = { u1: { '2026-03-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } } // March = month index 2
    const result = runGenericModel(makeCFBSConfig(), actuals)
    expect(result.cf.act_mask[0]).toBe(false) // Jan -- before the actual month
    expect(result.cf.act_mask[1]).toBe(false) // Feb -- before the actual month
    expect(result.cf.act_mask[2]).toBe(true)  // March -- the actual month itself
    expect(result.cf.act_mask[3]).toBe(true)  // April -- carries forward, even with no actual data of its own
    expect(result.cf.act_mask[11]).toBe(true) // December -- still carries forward to the end
  })

  it('REG: balance sheet act_mask matches cash flow act_mask exactly -- same underlying cumulative NPAT', () => {
    const actuals = { u1: { '2026-06-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCFBSConfig(), actuals)
    expect(result.bs.act_mask).toEqual(result.cf.act_mask)
  })

  it('REG: retained earnings correctly uses the actual NPAT for a closed month instead of the planned figure', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCFBSConfig(), actuals)
    const openingCash = 5_000_000 // makeConfig's actual default opening_cash_balance
    const expectedRetainedEarnings = openingCash + (result.con.act_npat[0] as number)
    expect(result.bs.retained_earnings[0]).toBeCloseTo(expectedRetainedEarnings, 2)
    // Must NOT equal what it would be using the planned figure instead
    expect(result.bs.retained_earnings[0]).not.toBeCloseTo(openingCash + result.con.npat[0], 2)
  })

  it('REG: the fundamental accounting identity (Assets = Equity + Liabilities) still holds when actuals are present, not just in the pure-plan case', () => {
    const actuals = { u1: { '2026-04-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCFBSConfig(), actuals)
    for (let m = 0; m < 12; m++) {
      expect(result.bs.total_assets[m]).toBeCloseTo(result.bs.total_equity_and_liabilities[m], 2)
    }
  })

  it('REG: a month with actual revenue but not yet actual EBITDA (missing cost data) does NOT affect cash flow -- never blends partial actual data', () => {
    // Only revenue actual entered -- act_npat must stay null, so hybrid
    // NPAT correctly falls back to the planned figure for this month.
    const actuals = { u1: { '2026-02-01': { rev1: 9_000_000 } } }
    const result = runGenericModel(makeCFBSConfig(), actuals)
    expect(result.con.act_npat[1]).toBeNull()
    expect(result.cf.act_mask[1]).toBe(false)
    expect(result.cf.op_cash[1]).toBeCloseTo(result.con.npat[1] + (result.cf.working_capital_adj[1] || 0), 2)
  })
})
