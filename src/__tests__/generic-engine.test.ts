import { describe, it, expect } from 'vitest'
import { runGenericModel, defaultGenericConfig, spreadLine, serviceFeeLine, buildYearGroups, collapseYear, defaultExpandedYears, extendPlanningHorizon } from '../lib/generic-engine'
import { deriveActualOperatingCosts } from '../lib/actuals'

function expectBalanceSheetBalances(result: ReturnType<typeof runGenericModel>) {
  result.bs.total_assets.forEach((assets: number, i: number) => {
    const equity = result.bs.total_equity_and_liabilities[i]
    expect(Math.abs(assets - equity)).toBeLessThan(1)
  })
}

// Shared date-relative helpers for calendar-rule tests, so they stay
// deterministic regardless of the real date they run on -- a config
// whose start_date is N months before "now" puts month index N at
// "current", with 0..N-1 in the past and N+1.. in the future. Hoisted
// here (rather than redefined per describe block) to avoid drift
// between copies.
function monthsAgoISO(n: number): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function makeCalendarConfig(pastMonths: number, futureMonths: number, overrides: Record<string, any> = {}) {
  return makeConfig({ start_date: monthsAgoISO(pastMonths), planning_months: pastMonths + 1 + futureMonths, ...overrides })
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

describe('Generic Engine — Actuals (calendar-based actual/plan rule)', () => {
  // The rule under test: a month at or before the current calendar month
  // shows whatever actual was entered (zero if none), never falling back
  // to plan. A future month uses the plan (act_* is null there, meaning
  // "use plan" at display). monthsAgoISO/makeCalendarConfig (module-level,
  // above) make these tests deterministic regardless of the real date
  // they run on.

  it('REG: with no actuals passed, a PAST or CURRENT month shows zero actual (not plan, not null); a FUTURE month stays null (use plan)', () => {
    // start 2 months ago -> index 0,1 past, index 2 current, index 3,4 future
    const result = runGenericModel(makeCalendarConfig(2, 2))
    // Past/current: actual is 0 (nothing entered), NOT the planned figure
    expect(result.con.act_gp[0]).toBe(0)
    expect(result.con.act_gp[1]).toBe(0)
    expect(result.con.act_gp[2]).toBe(0)
    expect(result.con.act_ebitda[2]).toBe(0)
    // Future: null, meaning display falls back to plan
    expect(result.con.act_gp[3]).toBeNull()
    expect(result.con.act_gp[4]).toBeNull()
    expect(result.con.act_ebitda[4]).toBeNull()
  })

  it('REG: a past/current month uses actual revenue and actual cost together -- never actual revenue mixed with planned cost', () => {
    const period = monthsAgoISO(1) // last month -> a past month
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000 } } }
    const result = runGenericModel(makeCalendarConfig(2, 2), actuals)
    // index 1 = last month
    expect(result.unitPL['u1'].act_rev[1]).toBe(9_000_000)
    expect(result.unitPL['u1'].act_gp[1]).toBe(5_500_000) // 9,000,000 - 3,500,000
    expect(result.con.act_gp[1]).toBe(5_500_000)
  })

  it('REG: a past/current month with only partial actuals treats the unentered categories as zero, not as plan', () => {
    // Only revenue entered for last month; cost/staff/opex not entered.
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000 } } }
    const result = runGenericModel(makeCalendarConfig(2, 2), actuals)
    // GP = actual revenue - zero actual cost = 9,000,000 (NOT revenue minus PLANNED cost)
    expect(result.con.act_gp[1]).toBe(9_000_000)
    // EBITDA = 9,000,000 - 0 staff - 0 opex - 0 shared = 9,000,000
    expect(result.con.act_ebitda[1]).toBe(9_000_000)
    // And it must NOT equal the figure you'd get by subtracting planned costs
    expect(result.con.act_ebitda[1]).not.toBe(4_000_000)
  })

  it('REG: act_ebitda for a past/current month uses ONLY actual figures, computed correctly when all categories are entered', () => {
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(2, 2), actuals)
    // 9,000,000 - 3,500,000 - 1,400,000 - 450,000 = 3,650,000
    expect(result.con.act_ebitda[1]).toBe(3_650_000)
  })

  it('REG: a FUTURE month stays null (use plan) even when actuals exist for a past month', () => {
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(2, 2), actuals)
    expect(result.con.act_ebitda[1]).not.toBeNull() // past month, has actuals
    expect(result.con.act_ebitda[3]).toBeNull()     // future month, stays plan
    expect(result.con.act_ebitda[4]).toBeNull()
  })

  it('REG: actuals for a month outside the planning window are ignored, not out-of-bounds errors', () => {
    const actuals = { u1: { '2030-01-01': { rev1: 9_000_000 } } }
    expect(() => runGenericModel(makeCalendarConfig(2, 2), actuals)).not.toThrow()
  })

  it('REG: act_gp minus (act_staff + act_opex + shared) reconciles exactly to act_ebitda for an actual month -- this is what the P&L displays, and it must foot', () => {
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(2, 2), actuals)
    const actOpexTotal = (result.con.act_staff[1] as number) + (result.con.act_opex[1] as number)
    expect((result.con.act_gp[1] as number) - actOpexTotal).toBe(result.con.act_ebitda[1])
  })
})

describe('Generic Engine — Cash Flow and Balance Sheet under the calendar rule', () => {

  it('REG: act_mask is true for every past/current month and false for every future month', () => {
    // start 3 months ago -> indices 0,1,2 past, 3 current, 4,5 future
    const result = runGenericModel(makeCalendarConfig(3, 2))
    expect(result.cf.act_mask[0]).toBe(true)  // past
    expect(result.cf.act_mask[3]).toBe(true)  // current
    expect(result.cf.act_mask[4]).toBe(false) // future
    expect(result.cf.act_mask[5]).toBe(false) // future
    // Balance sheet shares the same mask
    expect(result.bs.act_mask).toEqual(result.cf.act_mask)
  })

  it('REG: a past month with actual EBITDA produces actual NPAT, which feeds operating cash flow for that month', () => {
    const period = monthsAgoISO(2)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(3, 2), actuals)
    expect(result.con.act_npat[1]).not.toBeNull() // index 1 = 2 months ago
    const expectedOpCash = (result.con.act_npat[1] as number) + (result.cf.working_capital_adj[1] || 0)
    expect(result.cf.op_cash[1]).toBeCloseTo(expectedOpCash, 2)
  })

  it('REG: cash is cumulative -- a future month carries the actual-derived closing balance forward into its opening balance', () => {
    const period = monthsAgoISO(2)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(3, 2), actuals)
    // A future month's opening cash equals the prior month's closing cash --
    // continuity across the actual/plan boundary, never a reset.
    expect(result.cf.open[4]).toBeCloseTo(result.cf.close[3], 2)
  })

  it('REG: retained earnings uses the actual NPAT for a past month, not the planned figure', () => {
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(3, 2), actuals)
    // index 1 = 2 months ago (no actuals -> act_npat there is the zero-actual
    // figure), index 2 = last month (has actuals). Retained earnings at index
    // 2 must reflect the ACTUAL npat for that month, not the planned one.
    expect(result.con.act_npat[2]).not.toBeNull()
    // The actual npat for the entered month must differ from its planned npat,
    // proving retained earnings is built from real data for that month.
    expect(result.con.act_npat[2]).not.toBeCloseTo(result.con.npat[2], 2)
  })

  it('REG: the fundamental accounting identity (Assets = Equity + Liabilities) holds in every month, actual and plan alike', () => {
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000, cogs1: 3_500_000, staff1: 1_400_000, opex1: 450_000 } } }
    const result = runGenericModel(makeCalendarConfig(3, 2), actuals)
    for (let m = 0; m < 6; m++) {
      expect(result.bs.total_assets[m]).toBeCloseTo(result.bs.total_equity_and_liabilities[m], 2)
    }
  })

  it('REG: a past/current month with only partial actuals still uses the actual-derived figure (zero for unentered), never the plan', () => {
    // Only revenue entered for last month -- under the calendar rule this is
    // still an actual month; the unentered costs are treated as zero.
    const period = monthsAgoISO(1)
    const actuals = { u1: { [period]: { rev1: 9_000_000 } } }
    const result = runGenericModel(makeCalendarConfig(3, 2), actuals)
    expect(result.con.act_npat[2]).not.toBeNull() // index 2 = last month, a past month
    expect(result.cf.act_mask[2]).toBe(true)
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

  it('REG: under the calendar rule, a past month with a staff line but no staff actual entered treats staff as zero -- it does NOT fall back to the planned staff figure', () => {
    const configWithStaff = makeNoStaffConfig({
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
        { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
        { id: 'staff1', unit_id: 'u1', name: 'Staff', category: 'staff', line_type: 'standard', monthly_plan: Array(12).fill(1_500_000), active: true },
        { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
      ],
    })
    // 2026-01-01 is a past month (env date is mid-2026). Staff line exists,
    // but no actual staff figure was entered. Under the calendar rule the
    // month is still actual; unentered staff counts as zero recorded, NOT
    // the planned 1,500,000.
    const actuals = { u1: { '2026-01-01': { rev1: 9_000_000, cogs1: 3_500_000, opex1: 450_000 } } }
    const result = runGenericModel(configWithStaff, actuals)
    // EBITDA = 9,000,000 - 3,500,000 - 0 staff - 450,000 = 5,050,000
    expect(result.con.act_ebitda[0]).toBe(5_050_000)
    // Must NOT equal the figure using the planned staff cost instead
    // (9,000,000 - 3,500,000 - 1,500,000 - 450,000 = 3,550,000)
    expect(result.con.act_ebitda[0]).not.toBe(3_550_000)
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

  it('REG: unit-level actual EBITDA for a past month with a staff line but no staff actual treats staff as zero, not withheld and not planned', () => {
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
    // 9,000,000 - 3,500,000 - 0 staff - 450,000 = 5,050,000 (no shared here)
    expect(result.unitPL['u1'].act_ebitda[0]).toBe(5_050_000)
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

describe('Generic Engine — parent rollup under the calendar rule (multiple sub-units)', () => {
  // Under the calendar rule, a past/current month shows whatever actual
  // was entered across all sub-units, treating anything unentered as
  // zero -- there is no "withhold until every sub reports" gating. This
  // is the deliberate behaviour Habib specified: a past month reflects
  // the figures that were actually recorded in that month, no more, no
  // less.

  // start 1 month ago -> index 0 is the only past/current month within a
  // 12-month window; index 11 is always comfortably future, regardless of
  // the real date this test runs on.
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
      start_date: monthsAgoISO(1),
      ...overrides,
    })
  }

  it('REG: for a past month, parent act_gp sums whatever actuals were reported, treating an unreported sub cost as zero (not planned, not withheld)', () => {
    // Sub A fully reports; Sub B reports revenue but not its cogs.
    const period = monthsAgoISO(1)
    const actuals = {
      subA: { [period]: { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { [period]: { revB: 4_800_000 } }, // cogsB not entered -> counts as zero
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    const parentPL = result.unitPL['parent1']
    // GP = (4,500,000 + 4,800,000) revenue - (1,800,000 + 0) cost = 7,500,000
    expect(parentPL.act_gp[0]).toBe(7_500_000)
    // Must NOT use Sub B's PLANNED cogs (2,000,000) -- that would give 5,500,000
    expect(parentPL.act_gp[0]).not.toBe(5_500_000)
  })

  it('REG: parent act_gp for a past month reflects all reported actuals when every sub has reported', () => {
    const period = monthsAgoISO(1)
    const actuals = {
      subA: { [period]: { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { [period]: { revB: 4_800_000, cogsB: 1_900_000 } },
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    const parentPL = result.unitPL['parent1']
    expect(parentPL.act_gp[0]).toBe((4_500_000 + 4_800_000) - (1_800_000 + 1_900_000))
  })

  it('REG: the same past-month actual-or-zero behaviour applies at the consolidated level, matching the parent rollup', () => {
    const period = monthsAgoISO(1)
    const actuals = {
      subA: { [period]: { revA: 4_500_000, cogsA: 1_800_000 } },
      subB: { [period]: { revB: 4_800_000 } }, // cogsB not entered
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    expect(result.con.act_gp[0]).toBe(7_500_000)
  })

  it('REG: a FUTURE month for this business stays null (use plan) regardless of any actuals -- stable regardless of the real date this test runs on', () => {
    const period = monthsAgoISO(1)
    const actuals = {
      subA: { [period]: { revA: 4_500_000, cogsA: 1_800_000 } },
    }
    const result = runGenericModel(makeParentWithSubsConfig(), actuals)
    // start = 1 month ago -> index 0 is the current month, index 11 is 10
    // months into the future -- always future, never drifts to past.
    expect(result.con.act_gp[11]).toBeNull()
  })
})

describe('Generic Engine — revenue under the calendar rule (multiple units)', () => {
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

  it('REG: for a past month, consolidated act_gp sums whatever revenue was reported, treating an unreported unit as zero (not withheld)', () => {
    // Only u1 reports revenue -- u2 has a revenue line but nothing entered.
    const actuals = { u1: { '2026-01-01': { rev1: 4_800_000 } } }
    const result = runGenericModel(makeTwoRevUnitsConfig(), actuals)
    // Past month -> actual-or-zero. GP = 4,800,000 reported + 0 for u2 - 0 cost
    expect(result.con.act_gp[0]).toBe(4_800_000)
    expect(result.con.act_ebitda[0]).toBe(4_800_000)
  })

  it('REG: consolidated act_gp for a past month reflects all reported revenue when every unit has reported', () => {
    const actuals = {
      u1: { '2026-01-01': { rev1: 4_800_000 } },
      u2: { '2026-01-01': { rev2: 5_100_000 } },
    }
    const result = runGenericModel(makeTwoRevUnitsConfig(), actuals)
    expect(result.con.act_gp[0]).toBe(4_800_000 + 5_100_000)
  })
})

describe('buildYearGroups — data-driven year columns for the collapsible P&L presentation', () => {
  it('REG: a model starting mid-year produces a partial first year containing only the months from start_date onward', () => {
    // Starts April 2026, 24 months -> spans Apr 2026 through Mar 2028
    const groups = buildYearGroups('2026-04-02', 24)
    expect(groups[0].year).toBe(2026)
    expect(groups[0].monthIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]) // Apr..Dec = 9 months
  })

  it('REG: full calendar years in the middle of the range contain all 12 months', () => {
    const groups = buildYearGroups('2026-04-02', 24)
    expect(groups[1].year).toBe(2027)
    expect(groups[1].monthIndices.length).toBe(12)
  })

  it('REG: a range that ends mid-year produces a partial final year', () => {
    // 24 months from April 2026 ends March 2028 -> 2028 only has Jan-Mar
    const groups = buildYearGroups('2026-04-02', 24)
    expect(groups[2].year).toBe(2028)
    expect(groups[2].monthIndices.length).toBe(3)
  })

  it('REG: the number of year-groups is derived entirely from the data, not a fixed count -- more planning months produce more groups automatically', () => {
    const groups24 = buildYearGroups('2026-01-01', 24)
    const groups60 = buildYearGroups('2026-01-01', 60)
    expect(groups24.length).toBe(2) // 2026, 2027
    expect(groups60.length).toBe(5) // 2026, 2027, 2028, 2029, 2030
  })

  it('REG: a start_date of January 1st produces a full 12-month first year, not a partial one', () => {
    const groups = buildYearGroups('2026-01-01', 12)
    expect(groups.length).toBe(1)
    expect(groups[0].monthIndices.length).toBe(12)
  })
})

describe('collapseYear — the year total and its actual/plan/partial status', () => {
  it('REG: a year where every included month is actual is fully actual', () => {
    const values = [100, 200, 300]
    const actualMask = [true, true, true]
    const result = collapseYear(values, actualMask, [0, 1, 2])
    expect(result.value).toBe(600)
    expect(result.isFullyActual).toBe(true)
    expect(result.isPartiallyActual).toBe(false)
    expect(result.isFullyPlan).toBe(false)
  })

  it('REG: a year where every included month is plan is fully plan', () => {
    const values = [100, 200, 300]
    const actualMask = [false, false, false]
    const result = collapseYear(values, actualMask, [0, 1, 2])
    expect(result.isFullyPlan).toBe(true)
    expect(result.isFullyActual).toBe(false)
    expect(result.isPartiallyActual).toBe(false)
  })

  it('REG: the current year in progress (some months actual, some still plan) is neither fully actual nor fully plan -- it is its own distinct partial state', () => {
    // Models a year like 2026 as of July: Apr-Jun actual, Jul(current)
    // actual-to-date, Aug-Dec still plan.
    const values = [100, 100, 100, 100, 100, 100, 100, 100, 100]
    const actualMask = [true, true, true, true, false, false, false, false, false]
    const result = collapseYear(values, actualMask, [0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.isFullyActual).toBe(false)
    expect(result.isFullyPlan).toBe(false)
    expect(result.isPartiallyActual).toBe(true)
    expect(result.value).toBe(900) // the total still sums whatever is in each month, actual or plan
  })

  it('REG: with no actualMask provided at all (e.g. Interest, which has no actual/plan distinction), the year is treated as fully plan, not fully actual', () => {
    const result = collapseYear([100, 200], undefined, [0, 1])
    expect(result.isFullyPlan).toBe(true)
    expect(result.isFullyActual).toBe(false)
  })

  it('REG: the collapsed value correctly sums only the months belonging to this specific year, ignoring months outside monthIndices', () => {
    const values = [10, 20, 30, 40, 50]
    const result = collapseYear(values, undefined, [2, 3]) // only months at index 2 and 3
    expect(result.value).toBe(70) // 30 + 40, not the full array
  })
})

describe('collapseYear — endOfPeriod and startOfPeriod aggregation (Balance Sheet, Opening/Closing Cash)', () => {
  it('REG: endOfPeriod uses the LAST month in the year, never a sum -- critical for Balance Sheet, where summing 12 months of Total Assets would be meaningless', () => {
    // A stock value that happens to stay constant at 1,000,000 all year --
    // if this were wrongly summed like a flow, collapsing 9 months would
    // wrongly show 9,000,000 instead of the real balance of 1,000,000.
    const values = Array(9).fill(1_000_000)
    const result = collapseYear(values, undefined, [0,1,2,3,4,5,6,7,8], 'endOfPeriod')
    expect(result.value).toBe(1_000_000)
    expect(result.value).not.toBe(9_000_000)
  })

  it('REG: startOfPeriod uses the FIRST month in the year -- specifically for Opening Cash, which is the prior period\'s closing balance carried forward', () => {
    const values = [500_000, 600_000, 700_000]
    const result = collapseYear(values, undefined, [0, 1, 2], 'startOfPeriod')
    expect(result.value).toBe(500_000)
  })

  it('REG: a point-in-time balance has no "partially actual" state -- it is either as of an actual month or a planned one, never a blend', () => {
    const values = [100, 200, 300]
    const actualMask = [true, true, false] // year is mixed, but the LAST month (index 2) is plan
    const result = collapseYear(values, actualMask, [0, 1, 2], 'endOfPeriod')
    expect(result.isFullyPlan).toBe(true)
    expect(result.isFullyActual).toBe(false)
    expect(result.isPartiallyActual).toBe(false) // never partial for a point-in-time figure
  })

  it('REG: endOfPeriod correctly reports fully actual when the last month in the year is itself actual, regardless of earlier months', () => {
    const values = [100, 200, 300]
    const actualMask = [false, true, true] // first month is plan, but the relevant (last) month is actual
    const result = collapseYear(values, actualMask, [0, 1, 2], 'endOfPeriod')
    expect(result.isFullyActual).toBe(true)
    expect(result.isPartiallyActual).toBe(false)
  })
})

describe('collapseYear — average aggregation (per-unit prices and rates, e.g. Buy Price, Fee per Engagement)', () => {
  it('REG: averages only the non-zero months -- a month with no activity does not drag down the average price', () => {
    const values = [10000, 0, 12000, 0, 11000] // price only exists in months with actual sales
    const result = collapseYear(values, undefined, [0,1,2,3,4], 'average')
    expect(result.value).toBeCloseTo((10000+12000+11000)/3, 5) // NOT divided by 5
  })

  it('REG: summing 12 months of a price would be meaningless -- average never does this', () => {
    const constantPrice = Array(12).fill(5000)
    const result = collapseYear(constantPrice, undefined, Array.from({length:12},(_,i)=>i), 'average')
    expect(result.value).toBe(5000) // the actual price, not 60,000 (12 x 5000)
  })

  it('REG: all-zero months (no activity at all in this range) average to 0, not NaN from an empty division', () => {
    const result = collapseYear([0,0,0], undefined, [0,1,2], 'average')
    expect(result.value).toBe(0)
    expect(Number.isNaN(result.value)).toBe(false)
  })

  it('REG: actual/plan status for average uses the whole range\'s mask, like sum, not a single endpoint month', () => {
    const values = [10000, 11000, 12000]
    const actualMask = [true, true, false] // partially actual across the range
    const result = collapseYear(values, actualMask, [0,1,2], 'average')
    expect(result.isPartiallyActual).toBe(true)
  })
})

describe('defaultExpandedYears — which year starts expanded', () => {
  it('REG: the year containing today expands by default, all others stay collapsed', () => {
    const groups = [{year: 2025, label: '2025', monthIndices: [0]}, {year: 2026, label: '2026', monthIndices: [1]}, {year: 2027, label: '2027', monthIndices: [2]}]
    const result = defaultExpandedYears(groups, 2026)
    expect(result[2025]).toBe(false)
    expect(result[2026]).toBe(true)
    expect(result[2027]).toBe(false)
  })

  it('REG: when the current calendar year is not in the model range at all (a fully-future plan, or a historical archive), falls back to the FIRST year instead of leaving everything collapsed', () => {
    // Models exactly the scenario CodeRabbit flagged: a plan starting well
    // into the future, so today's year never matches any group.
    const groups = [{year: 2030, label: '2030', monthIndices: [0]}, {year: 2031, label: '2031', monthIndices: [1]}]
    const result = defaultExpandedYears(groups, 2026)
    expect(result[2030]).toBe(true)  // first year, used as the fallback
    expect(result[2031]).toBe(false)
  })

  it('REG: a single-year range with no match still expands that one year via the fallback', () => {
    const groups = [{year: 2030, label: '2030', monthIndices: [0]}]
    const result = defaultExpandedYears(groups, 2026)
    expect(result[2030]).toBe(true)
  })
})

describe('extendPlanningHorizon — growing a client\'s planning horizon indefinitely', () => {
  function makeConfigWithEverything() {
    return defaultGenericConfig({
      client_id: 'test', business_name: 'Test Co', currency: 'UGX', planning_months: 12,
      business_units: [{ id: 'u1', name: 'Main Unit', short: 'MU', type: 'mixed', color: '#00B4D8', headcount: 0, active: true, sort_order: 0 }],
      plan_lines: [
        { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(1_000_000), active: true },
        {
          id: 'spread1', unit_id: 'u1', name: 'Trading', category: 'revenue', line_type: 'spread', monthly_plan: Array(12).fill(0), active: true,
          buy_price: Array(12).fill(100), sell_price: Array(12).fill(150), volume: Array(12).fill(10),
        },
        {
          id: 'fee1', unit_id: 'u1', name: 'Advisory', category: 'revenue', line_type: 'service_fee', monthly_plan: Array(12).fill(0), active: true,
          fee_per_engagement: Array(12).fill(500), cost_per_engagement: Array(12).fill(100), engagements: Array(12).fill(5),
        },
      ],
      shared_lines: [
        { id: 'shared1', unit_id: '', name: 'Head Office', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(300_000), active: true },
      ],
      settings: {
        shared_cost_fixed_pct: 0.5, corporate_tax_rate: 0.30, opening_cash_balance: 5_000_000,
        capital_structure: { shareholder_contribution: 10_000_000, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, grace_period_months: 0, fixed_assets: 0 },
        trade_credit_lines: [
          { id: 'tc1', name: 'Input Supplier', type: 'payable', monthly_new: Array(12).fill(200_000), monthly_settled: Array(12).fill(180_000) },
        ],
      },
      start_date: '2026-01-01',
    })
  }

  it('REG: planning_months increases by exactly the number of additional months requested', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    expect(extended.planning_months).toBe(24)
  })

  it('REG: every plan line\'s monthly_plan grows to the new total length, existing values preserved exactly, new months zero-filled', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const rev1 = extended.plan_lines.find(l => l.id === 'rev1')!
    expect(rev1.monthly_plan.length).toBe(24)
    expect(rev1.monthly_plan.slice(0, 12)).toEqual(Array(12).fill(1_000_000)) // untouched
    expect(rev1.monthly_plan.slice(12)).toEqual(Array(12).fill(0)) // new months, zero-filled
  })

  it('REG: a spread-type line\'s buy_price/sell_price/volume all extend together, not just monthly_plan', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const spread1 = extended.plan_lines.find(l => l.id === 'spread1')!
    expect(spread1.buy_price!.length).toBe(24)
    expect(spread1.sell_price!.length).toBe(24)
    expect(spread1.volume!.length).toBe(24)
    expect(spread1.buy_price!.slice(0, 12)).toEqual(Array(12).fill(100))
  })

  it('REG: a service_fee-type line\'s fee_per_engagement/cost_per_engagement/engagements all extend together', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const fee1 = extended.plan_lines.find(l => l.id === 'fee1')!
    expect(fee1.fee_per_engagement!.length).toBe(24)
    expect(fee1.cost_per_engagement!.length).toBe(24)
    expect(fee1.engagements!.length).toBe(24)
  })

  it('REG: shared_lines extend the same way as plan_lines -- this is exactly the array that would silently fall out of sync if missed', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const shared1 = extended.shared_lines.find(l => l.id === 'shared1')!
    expect(shared1.monthly_plan.length).toBe(24)
    expect(shared1.monthly_plan.slice(0, 12)).toEqual(Array(12).fill(300_000))
  })

  it('REG: trade_credit_lines monthly_new/monthly_settled both extend together', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const tc1 = extended.settings.trade_credit_lines!.find(t => t.id === 'tc1')!
    expect(tc1.monthly_new.length).toBe(24)
    expect(tc1.monthly_settled.length).toBe(24)
    expect(tc1.monthly_new.slice(0, 12)).toEqual(Array(12).fill(200_000))
  })

  it('REG: is a pure function -- the original config object is never mutated', () => {
    const original = makeConfigWithEverything()
    const originalPlanningMonths = original.planning_months
    const originalRev1Length = original.plan_lines.find(l => l.id === 'rev1')!.monthly_plan.length
    extendPlanningHorizon(original, 12)
    expect(original.planning_months).toBe(originalPlanningMonths)
    expect(original.plan_lines.find(l => l.id === 'rev1')!.monthly_plan.length).toBe(originalRev1Length)
  })

  it('REG: the extended config actually runs correctly through the engine -- the whole point of this function', () => {
    const extended = extendPlanningHorizon(makeConfigWithEverything(), 12)
    const result = runGenericModel(extended)
    expect(result.con.rev.length).toBe(24)
    // Months 13-24 (the newly added ones) should reflect zero-filled plan
    // lines for rev1, but the spread/fee lines' own computed monthly_plan
    // depends on buy/sell/volume or fee/engagements, which were ALSO
    // zero-filled -- so total revenue for the new months should be 0.
    expect(result.con.rev[12]).toBe(0)
  })

  it('REG: a client with no trade_credit_lines at all extends without error', () => {
    const config = defaultGenericConfig({ planning_months: 12, plan_lines: [], shared_lines: [] })
    expect(() => extendPlanningHorizon(config, 12)).not.toThrow()
    expect(extendPlanningHorizon(config, 12).planning_months).toBe(24)
  })

  it('REG: requesting zero or negative additional months is a no-op, returning the config unchanged', () => {
    const original = makeConfigWithEverything()
    expect(extendPlanningHorizon(original, 0)).toBe(original)
    expect(extendPlanningHorizon(original, -5)).toBe(original)
  })

  it('REG: refuses to extend a config where an array is already out of sync with planning_months, rather than silently compounding the corruption', () => {
    const config = makeConfigWithEverything() // planning_months: 12, every array correctly 12 months
    // Corrupt one line's monthly_plan to 10 months, simulating a
    // pre-existing bug or manual data edit that desynced it from
    // planning_months.
    const corrupted = {
      ...config,
      plan_lines: config.plan_lines.map(l => l.id === 'rev1' ? { ...l, monthly_plan: l.monthly_plan.slice(0, 10) } : l),
    }
    expect(() => extendPlanningHorizon(corrupted, 12)).toThrow(/out of sync/)
    expect(() => extendPlanningHorizon(corrupted, 12)).toThrow(/rev1|Sales/) // identifies which line specifically
  })

  it('REG: the mismatch check covers the optional spread/service_fee/trade-credit arrays too, not just monthly_plan', () => {
    const config = makeConfigWithEverything()
    const corruptedSpread = {
      ...config,
      plan_lines: config.plan_lines.map(l => l.id === 'spread1' ? { ...l, buy_price: l.buy_price!.slice(0, 5) } : l),
    }
    expect(() => extendPlanningHorizon(corruptedSpread, 12)).toThrow(/out of sync/)

    const corruptedTradeCredit = {
      ...config,
      settings: { ...config.settings, trade_credit_lines: config.settings.trade_credit_lines!.map(t => ({ ...t, monthly_settled: t.monthly_settled.slice(0, 3) })) },
    }
    expect(() => extendPlanningHorizon(corruptedTradeCredit, 12)).toThrow(/out of sync/)
  })

  it('REG: a genuinely consistent config (the normal case) is never rejected by the guard', () => {
    expect(() => extendPlanningHorizon(makeConfigWithEverything(), 12)).not.toThrow()
  })

  it('REG: a fractional additionalMonths is rejected with a clear error, not an obscure RangeError from Array(2.5)', () => {
    expect(() => extendPlanningHorizon(makeConfigWithEverything(), 2.5)).toThrow(/whole number/)
  })

  it('REG: non-finite additionalMonths (NaN, Infinity) is also rejected', () => {
    expect(() => extendPlanningHorizon(makeConfigWithEverything(), NaN)).toThrow(/whole number/)
    expect(() => extendPlanningHorizon(makeConfigWithEverything(), Infinity)).toThrow(/whole number/)
  })
})
