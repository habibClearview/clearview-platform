import { describe, it, expect } from 'vitest'
import { runGenericModel, defaultGenericConfig, spreadLine, serviceFeeLine } from '../lib/generic-engine'
import { deriveActualOperatingCosts } from '../lib/actuals'

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

// Shared across all describe blocks (moved from being locally defined
// inside one describe block, which made it inaccessible to others --
// see docs on avoiding duplicated test config helpers).
function makeActualsConfig(overrides: Record<string,any> = {}) {
  return makeConfig({ start_date: '2026-01-01', ...overrides })
}

// Shared across every describe block that needs a minimal, otherwise-
// default settings block -- avoids reintroducing the same duplication
// pattern makeNoStaffConfig was already extracted to avoid.
const DEFAULT_TEST_SETTINGS = {
  shared_cost_fixed_pct: 0, corporate_tax_rate: 0.30, opening_cash_balance: 5_000_000,
  capital_structure: { shareholder_contribution: 10_000_000, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, grace_period_months: 0, fixed_assets: 0 },
}

// Also shared across describe blocks -- was duplicated identically in
// two places, risking silent drift if one copy were updated without the
// other.
function makeNoStaffConfig(overrides: Record<string,any> = {}) {
  return defaultGenericConfig({
    client_id: 'test', business_name: 'Test Co', currency: 'UGX', planning_months: 12,
    business_units: [{ id: 'u1', name: 'Main Unit', short: 'MU', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 0 }],
    plan_lines: [
      { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
      { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
      { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      // Deliberately NO staff-category plan line at all.
    ],
    settings: DEFAULT_TEST_SETTINGS,
    start_date: '2026-01-01',
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
  it('REG: with no actuals, cash flow and balance sheet are unaffected -- act_mask is all false', () => {
    const result = runGenericModel(makeActualsConfig())
    expect(result.cf.act_mask.every((v:boolean) => v === false)).toBe(true)
    expect(result.bs.act_mask.every((v:boolean) => v === false)).toBe(true)
  })

  it('REG: a month with actual EBITDA produces actual NPAT, which feeds into operating cash flow for that month', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.con.act_npat[0]).not.toBeNull()
    // Operating cash for month 0 should reflect the ACTUAL npat, not planned
    const expectedOpCash = (result.con.act_npat[0] as number) + (result.cf.working_capital_adj[0] || 0)
    expect(result.cf.op_cash[0]).toBeCloseTo(expectedOpCash, 2)
  })

  it('REG: cash flow act_mask bleeds forward from the first actual month onward, not just that one month -- cash is cumulative', () => {
    const actuals = { u1: { '2026-03-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } } // March = month index 2
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.cf.act_mask[0]).toBe(false) // Jan -- before the actual month
    expect(result.cf.act_mask[1]).toBe(false) // Feb -- before the actual month
    expect(result.cf.act_mask[2]).toBe(true)  // March -- the actual month itself
    expect(result.cf.act_mask[3]).toBe(true)  // April -- carries forward, even with no actual data of its own
    expect(result.cf.act_mask[11]).toBe(true) // December -- still carries forward to the end
  })

  it('REG: balance sheet act_mask matches cash flow act_mask exactly -- same underlying cumulative NPAT', () => {
    const actuals = { u1: { '2026-06-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    // June = month index 5. Asserting explicit expected values here, not
    // just comparing bs.act_mask to cf.act_mask -- the engine assigns
    // bs.act_mask as the SAME array reference as cf.act_mask, so a bare
    // toEqual comparison would pass even if the underlying cascade logic
    // were broken (it would just be comparing the object to itself).
    expect(result.bs.act_mask.slice(0, 5).every((v: boolean) => v === false)).toBe(true)
    expect(result.bs.act_mask.slice(5).every((v: boolean) => v === true)).toBe(true)
    expect(result.bs.act_mask).toEqual(result.cf.act_mask)
  })

  it('REG: retained earnings correctly uses the actual NPAT for a closed month instead of the planned figure', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    const openingCash = 5_000_000 // makeConfig's actual default opening_cash_balance
    const expectedRetainedEarnings = openingCash + (result.con.act_npat[0] as number)
    expect(result.bs.retained_earnings[0]).toBeCloseTo(expectedRetainedEarnings, 2)
    // Must NOT equal what it would be using the planned figure instead
    expect(result.bs.retained_earnings[0]).not.toBeCloseTo(openingCash + result.con.npat[0], 2)
  })

  it('REG: the fundamental accounting identity (Assets = Equity + Liabilities) still holds when actuals are present, not just in the pure-plan case', () => {
    const actuals = { u1: { '2026-04-01': { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    for (let m = 0; m < 12; m++) {
      expect(result.bs.total_assets[m]).toBeCloseTo(result.bs.total_equity_and_liabilities[m], 2)
    }
  })

  it('REG: a month with actual revenue but not yet actual EBITDA (missing cost data) does NOT affect cash flow -- never blends partial actual data', () => {
    // Only revenue actual entered -- act_npat must stay null, so hybrid
    // NPAT correctly falls back to the planned figure for this month.
    const actuals = { u1: { '2026-02-01': { rev1: 9_000_000 } } }
    const result = runGenericModel(makeActualsConfig(), actuals)
    expect(result.con.act_npat[1]).toBeNull()
    expect(result.cf.act_mask[1]).toBe(false)
    expect(result.cf.op_cash[1]).toBeCloseTo(result.con.npat[1] + (result.cf.working_capital_adj[1] || 0), 2)
  })
})

describe('Generic Engine — actual EBITDA when a category genuinely does not exist in the business', () => {
  // Found from real live data: a real client unit had revenue and
  // cost_of_sales plan lines, but no 'staff' category line at all (no
  // employees costed separately from overheads). The original gate
  // required ALL FOUR categories to have actual data before computing
  // actual EBITDA -- meaning a business with no staff line could NEVER
  // get an actual EBITDA, no matter how complete its real data was for
  // the categories that actually applied to it.

  it('REG: with revenue, cogs, and opex actuals present, actual EBITDA computes even though staff can never have actual data (no staff line exists)', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(makeNoStaffConfig(), actuals)
    expect(result.con.act_staff[0]).toBeNull() // never gets data -- there's no staff line to report against
    expect(result.con.act_ebitda[0]).not.toBeNull() // must NOT be blocked by the permanently-null staff figure
    expect(result.con.act_ebitda[0]).toBe(9_000_000 - 3_500_000 - 450_000) // = 5,050,000, treating absent staff as zero, not missing
  })

  it('REG: actual NPAT and hybrid cash flow also activate correctly when staff genuinely does not apply', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(makeNoStaffConfig(), actuals)
    expect(result.con.act_npat[0]).not.toBeNull()
    expect(result.cf.act_mask[0]).toBe(true)
  })

  it('REG: a business that DOES have a staff line still correctly withholds actual EBITDA until staff actual data is entered -- this fix does not weaken the existing safeguard for businesses that do have the category', () => {
    const configWithStaff = makeNoStaffConfig({
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
        { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
        { id: 'staff1', unit_id: 'u1', name: 'Staff', category: 'staff', line_type: 'standard', monthly_plan: Array(12).fill(1_500_000), active: true },
        { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      ],
    })
    // Staff line exists, but no actual staff figure was entered this month.
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(configWithStaff, actuals)
    expect(result.con.act_ebitda[0]).toBeNull() // correctly still withheld -- staff DOES apply here and its actual is genuinely missing
  })

  it('REG: actual Gross Profit similarly treats a missing cost_of_sales line as zero, not blocking, when the business genuinely has none', () => {
    const configNoCogs = makeNoStaffConfig({
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
        { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      ],
    })
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000 } } }
    const result = runGenericModel(configNoCogs, actuals)
    expect(result.con.act_gp[0]).toBe(9_000_000) // no COGS line anywhere -- treated as zero cost, not missing
  })

  it('REG: the shared deriveActualOperatingCosts function gives the correct small opex-only figure for a business with no staff line, not a fallback to a huge unrelated planned number', () => {
    // This is the exact second instance of the same bug class, found live:
    // GenericDashboard.tsx independently derived "actual operating costs"
    // from act_staff + act_opex directly, which had the identical
    // permanently-null-staff problem the engine fix above addresses.
    // The corrected UI derives it instead as hybridGrossProfit - act_ebitda,
    // via this shared function -- imported and called directly here
    // (not re-implemented) so a regression in the component's actual
    // formula is caught, not a copy of it.
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(makeNoStaffConfig(), actuals)
    const actEbitda = result.con.act_ebitda[0]
    // Passing the HYBRID gross profit value (what gpH.values[m] would be
    // in the component), not raw act_gp directly -- if the component ever
    // regressed to using planned GP here instead of the hybrid row, this
    // test would catch it, since a wrong hybridGrossProfit input would
    // produce a wrong derived Operating Costs figure.
    const hybridGrossProfit = result.con.act_gp[0] !== null ? result.con.act_gp[0]! : result.con.gp[0]
    const derivedOperatingCosts = deriveActualOperatingCosts(hybridGrossProfit, actEbitda)
    expect(derivedOperatingCosts).toBe(450_000) // exactly the real opex figure (450k-scale), nothing else
    expect(hybridGrossProfit - derivedOperatingCosts!).toBe(actEbitda) // must foot exactly, by construction
  })
})

describe('Generic Engine — per-unit actual EBITDA (the By Business Unit tab)', () => {
  // Found live, right after the consolidated-level fix shipped: the
  // consolidated view was correct, but the By Business Unit tab (the
  // default/most commonly viewed one) still showed a stale, purely
  // planned EBITDA for any unit -- because unit-level act_ebitda was
  // never actually computed as hybrid at all, by an earlier deliberate
  // design choice that turned out to be wrong. This directly caused the
  // exact "EBITDA looks nowhere close to Gross Profit" symptom reported.

  it('REG: unit-level actual EBITDA computes correctly for a unit with no staff line, instead of permanently showing the planned figure', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(makeNoStaffConfig(), actuals)
    const pl = result.unitPL['u1']
    expect(pl.act_ebitda[0]).not.toBeNull()
    expect(pl.act_ebitda[0]).toBe(9_000_000 - 3_500_000 - 450_000) // 5,050,000 -- staff treated as zero, shared is zero here too
  })

  it('REG: unit-level actual EBITDA still correctly withholds for a unit that DOES have a staff line, until its actual data arrives', () => {
    const configWithStaff = makeNoStaffConfig({
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
        { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
        { id: 'staff1', unit_id: 'u1', name: 'Staff', category: 'staff', line_type: 'standard', monthly_plan: Array(12).fill(1_500_000), active: true },
        { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      ],
    })
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } } // staff actual missing
    const result = runGenericModel(configWithStaff, actuals)
    expect(result.unitPL['u1'].act_ebitda[0]).toBeNull()
  })

  it('REG: unit-level EBITDA correctly reconciles: Gross Profit minus Staff minus Overheads minus Shared equals EBITDA, using actual figures', () => {
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(makeNoStaffConfig(), actuals)
    const pl = result.unitPL['u1']
    const gp = pl.act_gp[0] as number
    const staff = pl.act_staff[0] ?? 0 // null here (no staff line) -- treated as zero for reconciliation
    const opex = pl.act_opex[0] as number
    const shared = pl.shared[0] // always planned/allocated -- no actuals concept of its own
    expect(gp - staff - opex - shared).toBe(pl.act_ebitda[0])
  })
})

describe('Generic Engine — CodeRabbit findings on the per-unit EBITDA fix', () => {
  it('REG: per-unit act_gp treats a missing cost_of_sales line as zero, not blocking -- same fix as consolidated, previously missed at the unit level', () => {
    const configNoCogs = makeNoStaffConfig({
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
        { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      ],
    })
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, opex1: 450_000 } } }
    const result = runGenericModel(configNoCogs, actuals)
    expect(result.unitPL['u1'].act_gp[0]).toBe(9_000_000) // no COGS line anywhere for this unit -- zero cost, not missing
    expect(result.unitPL['u1'].act_ebitda[0]).toBe(9_000_000 - 450_000) // and act_ebitda now reachable too
  })

  it('REG: consolidated and per-unit actual EBITDA treat Shared Costs identically -- previously diverged by the whole shared pool', () => {
    const configWithShared = makeNoStaffConfig({
      settings: {
        shared_cost_fixed_pct: 0.5, corporate_tax_rate: 0.30, opening_cash_balance: 5_000_000,
        capital_structure: { shareholder_contribution: 10_000_000, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, grace_period_months: 0, fixed_assets: 0 },
      },
      shared_lines: [
        { id: 'shared1', unit_id: '', name: 'Head Office', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(300_000), active: true },
      ],
    })
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(configWithShared, actuals)
    const unitActEbitda = result.unitPL['u1'].act_ebitda[0]
    const consActEbitda = result.con.act_ebitda[0]
    // With a single unit consolidated, the consolidated figure must equal
    // the unit's own figure exactly -- previously the consolidated path
    // omitted the shared cost deduction entirely, so these would have
    // differed by the full shared pool (300,000 here).
    expect(consActEbitda).toBe(unitActEbitda)
    expect(unitActEbitda).not.toBeNull()
  })
})

describe('Generic Engine — parent rollup completeness with multiple sub-units', () => {
  // The exact case CodeRabbit flagged: a parent with multiple sub-units,
  // where one sub-unit HAS a cost_of_sales line but hasn't reported an
  // actual for it this month. merge() only adds a contribution when a
  // sub actually reports -- so the combined parent-level total could
  // otherwise look "complete" (non-null) using only the reporting sub's
  // figure, silently treating the non-reporting sub's real cost as zero.
  function makeParentWithSubsConfig(overrides: Record<string,any> = {}) {
    return defaultGenericConfig({
      client_id: 'test', business_name: 'Test Co', currency: 'UGX', planning_months: 12,
      business_units: [
        { id: 'parent1', name: 'Parent', short: 'PA', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 0 },
        { id: 'subA', name: 'Sub A', short: 'SA', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 1, parent_id: 'parent1' },
        { id: 'subB', name: 'Sub B', short: 'SB', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 2, parent_id: 'parent1' },
      ],
      plan_lines: [
        { id: 'revA', unit_id: 'subA', name: 'Sales A', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(5_000_000), active: true },
        { id: 'cogsA', unit_id: 'subA', name: 'COGS A', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(2_000_000), active: true },
        { id: 'revB', unit_id: 'subB', name: 'Sales B', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(5_000_000), active: true },
        { id: 'cogsB', unit_id: 'subB', name: 'COGS B', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(2_000_000), active: true },
      ],
      settings: DEFAULT_TEST_SETTINGS,
      start_date: '2026-01-01',
      ...overrides,
    })
  }

  it('REG: parent act_gp stays null when one sub-unit with a cost_of_sales line has not reported its actual, even though the other sub has', () => {
    // Sub A fully reports (revenue + cogs). Sub B reports revenue but NOT
    // cogs -- Sub B genuinely HAS a cogs line, it just hasn't been
    // entered for this month.
    const actuals = {
      subA: { '2026-01-01': { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { '2026-01-01': { revB: 4_800_000 } }, // cogsB missing
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    const parentPL = result.unitPL['parent1']
    expect(parentPL.act_gp[0]).toBeNull() // must NOT silently use only Sub A's cogs
    expect(parentPL.act_ebitda[0]).toBeNull() // depends on act_gp -- must also stay null, not just the intermediate figure
  })

  it('REG: parent act_gp correctly computes once BOTH sub-units have reported their cogs actuals', () => {
    const actuals = {
      subA: { '2026-01-01': { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { '2026-01-01': { revB: 4_800_000, cogsB: 1_900_000 } },
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    const parentPL = result.unitPL['parent1']
    expect(parentPL.act_gp[0]).toBe((4_500_000 + 4_800_000) - (1_800_000 + 1_900_000))
  })

  it('REG: the same incompleteness correctly propagates to the consolidated level too, not just the parent rollup', () => {
    const actuals = {
      subA: { '2026-01-01': { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { '2026-01-01': { revB: 4_800_000 } }, // cogsB still missing
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    expect(result.con.act_gp[0]).toBeNull()
    expect(result.con.act_ebitda[0]).toBeNull()
  })
})

describe('Generic Engine — revenue needs the same completeness gate as costs', () => {
  // Found live during CodeRabbit review: categoryCompleteAcrossUnits
  // handled cost_of_sales/staff/direct_opex, but not revenue itself --
  // meaning con.act_rev[m] !== null alone was treated as "revenue is
  // complete", even when two revenue-bearing units both contribute and
  // only one has actually reported. This silently understates GP/EBITDA
  // rather than correctly staying incomplete -- the same class of risk,
  // just on the revenue side instead of costs.
  function makeTwoRevUnitsConfig(overrides: Record<string,any> = {}) {
    return defaultGenericConfig({
      client_id: 'test', business_name: 'Test Co', currency: 'UGX', planning_months: 12,
      business_units: [
        { id: 'u1', name: 'Unit 1', short: 'U1', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 0 },
        { id: 'u2', name: 'Unit 2', short: 'U2', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 1 },
      ],
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales 1', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(5_000_000), active: true },
        { id: 'rev2', unit_id: 'u2', name: 'Sales 2', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(5_000_000), active: true },
      ],
      settings: DEFAULT_TEST_SETTINGS,
      start_date: '2026-01-01',
      ...overrides,
    })
  }

  it('REG: consolidated act_gp stays null when one revenue-bearing unit has not reported, even though another has', () => {
    // Only u1 reports revenue this month -- u2 genuinely has a revenue
    // line, it just hasn't been entered.
    const actuals = { u1: { '2026-01-01': { rev1: 4_800_000 } } }
    const result = runGenericModel(makeTwoRevUnitsConfig(), actuals)
    expect(result.con.act_rev[0]).not.toBeNull() // the raw merged total IS non-null (this is exactly what made the bug possible)
    expect(result.con.act_gp[0]).toBeNull() // but act_gp must correctly stay incomplete
    expect(result.con.act_ebitda[0]).toBeNull()
  })

  it('REG: consolidated act_gp correctly computes once every revenue-bearing unit has reported', () => {
    const actuals = {
      u1: { '2026-01-01': { rev1: 4_800_000 } },
      u2: { '2026-01-01': { rev2: 5_100_000 } },
    }
    const result = runGenericModel(makeTwoRevUnitsConfig(), actuals)
    expect(result.con.act_gp[0]).toBe(4_800_000 + 5_100_000)
  })
})
