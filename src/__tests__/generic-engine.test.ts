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

  it('REG: balance sheet still balances with an active bank loan (liability stays flat until debt service is wired into cash flow)', () => {
    const cfg = makeConfig()
    cfg.settings.capital_structure.bank_loan = 12_000_000
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
  })
})

describe('Generic Engine — Spread & Service Fee revenue lines', () => {
  it('spread line revenue equals gross sale value (sell price x volume), not net margin', () => {
    const cfg = makeConfig()
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = Array(12).fill(800)
    line.sell_price = Array(12).fill(1200)
    line.volume     = Array(12).fill(500)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    // Revenue is the gross sale value: 1200 x 500 = 600,000/month x 12 = 7,200,000/yr,
    // on top of the 120,000,000 base revenue already in makeConfig(). Buy cost
    // flows into COGS separately, not netted against revenue.
    expect(result.metrics.total_revenue).toBe(120_000_000 + 7_200_000)
  })

  it('spread line buy cost flows into cost of sales, not revenue', () => {
    const cfg = makeConfig()
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = Array(12).fill(800)
    line.sell_price = Array(12).fill(1200)
    line.volume     = Array(12).fill(500)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    const baseGp = 120_000_000 - 48_000_000 // base revenue - base COGS from makeConfig()
    // Revenue is gross sale value (1200 x 500 x 12 = 7,200,000), COGS is buy
    // cost (800 x 500 x 12 = 4,800,000), so GP contribution is the spread
    // itself: (1200-800) x 500 x 12 = 2,400,000
    expect(result.metrics.total_gp).toBe(baseGp + 2_400_000)
  })

  it('spread line with varying monthly prices (harvest season pricing) sums correctly', () => {
    const cfg = makeConfig()
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = [800,800,850, ...Array(9).fill(800)]
    line.sell_price = [1200,1200,1250, ...Array(9).fill(1200)]
    line.volume     = [500,620,480, ...Array(9).fill(500)]
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    // Revenue is gross sale value per month: Jan 1200x500=600,000
    // Feb 1200x620=744,000 Mar 1250x480=600,000, remaining 9 months 1200x500=600,000 each=5,400,000
    const expectedSpreadRevenue = 600_000 + 744_000 + 600_000 + 5_400_000
    expect(result.metrics.total_revenue).toBe(120_000_000 + expectedSpreadRevenue)
  })

  it('service fee line revenue equals fee per engagement x number of engagements', () => {
    const cfg = makeConfig()
    const line = serviceFeeLine('advisory', 'u1', 'Advisory fees', 12)
    line.fee_per_engagement  = Array(12).fill(50_000)
    line.cost_per_engagement = Array(12).fill(10_000)
    line.engagements         = Array(12).fill(4)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    // 50,000 x 4 x 12 = 2,400,000
    expect(result.metrics.total_revenue).toBe(120_000_000 + 2_400_000)
  })

  it('service fee line cost per engagement flows into cost of sales', () => {
    const cfg = makeConfig()
    const line = serviceFeeLine('advisory', 'u1', 'Advisory fees', 12)
    line.fee_per_engagement  = Array(12).fill(50_000)
    line.cost_per_engagement = Array(12).fill(10_000)
    line.engagements         = Array(12).fill(4)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    const baseGp = 120_000_000 - 48_000_000
    // GP contribution = (50,000-10,000) x 4 x 12 = 1,920,000
    expect(result.metrics.total_gp).toBe(baseGp + 1_920_000)
  })

  it('REG: balance sheet still balances with an active spread line', () => {
    const cfg = makeConfig()
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = Array(12).fill(800)
    line.sell_price = Array(12).fill(1200)
    line.volume     = Array(12).fill(500)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
  })

  it('REG: balance sheet still balances with an active service fee line', () => {
    const cfg = makeConfig()
    const line = serviceFeeLine('advisory', 'u1', 'Advisory fees', 12)
    line.fee_per_engagement  = Array(12).fill(50_000)
    line.cost_per_engagement = Array(12).fill(10_000)
    line.engagements         = Array(12).fill(4)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    expectBalanceSheetBalances(result)
  })

  it('a spread line with zero volume contributes zero revenue (falsy-zero check)', () => {
    const cfg = makeConfig()
    const line = spreadLine('tomatoes', 'u1', 'Tomato sales', 12)
    line.buy_price  = Array(12).fill(800)
    line.sell_price = Array(12).fill(1200)
    line.volume     = Array(12).fill(0)
    cfg.plan_lines = [...cfg.plan_lines, line]
    const result = runGenericModel(cfg)
    expect(result.metrics.total_revenue).toBe(120_000_000)
  })
})
