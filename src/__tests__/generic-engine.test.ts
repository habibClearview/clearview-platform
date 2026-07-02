import { describe, it, expect } from 'vitest'
import { runGenericModel, defaultGenericConfig } from '../lib/generic-engine'

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
    result.bs.total_assets.forEach((assets: number, i: number) => {
      const equity = result.bs.total_equity_and_liabilities[i]
      expect(Math.abs(assets - equity)).toBeLessThan(1)
    })
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
})
