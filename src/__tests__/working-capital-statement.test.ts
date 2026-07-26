import { describe, it, expect } from 'vitest'
import { runGenericModel, defaultGenericConfig } from '../lib/generic-engine'
import { computeWorkingCapitalStatement } from '../lib/working-capital-statement'

// Build a config that exercises every cash line the statement decomposes:
// revenue, COGS, staff, overheads, a loan (interest + principal), fixed
// assets (capex), and both receivable and payable trade-credit lines.
function makeConfig(overrides: Record<string, any> = {}) {
  return defaultGenericConfig({
    client_id: 'wc-test',
    business_name: 'WC Test Co',
    currency: 'UGX',
    planning_months: 12,
    business_units: [{ id: 'u1', name: 'Main', short: 'MU', type: 'mixed', color: '#00B4D8', headcount: 2, active: true, sort_order: 0 }],
    plan_lines: [
      { id: 'rev1', unit_id: 'u1', name: 'Sales', category: 'revenue', line_type: 'standard', monthly_plan: Array(12).fill(10_000_000), active: true },
      { id: 'cogs1', unit_id: 'u1', name: 'COGS', category: 'cost_of_sales', line_type: 'standard', monthly_plan: Array(12).fill(4_000_000), active: true },
      { id: 'staff1', unit_id: 'u1', name: 'Staff', category: 'staff', line_type: 'standard', monthly_plan: Array(12).fill(1_500_000), active: true },
      { id: 'opex1', unit_id: 'u1', name: 'Overheads', category: 'direct_opex', line_type: 'standard', monthly_plan: Array(12).fill(500_000), active: true },
    ],
    settings: {
      shared_cost_fixed_pct: 0,
      corporate_tax_rate: 0.30,
      opening_cash_balance: 5_000_000,
      capital_structure: {
        shareholder_contribution: 10_000_000, grant_non_repayable: 0, grant_recoverable: 0,
        bank_loan: 20_000_000, annual_interest_rate: 0.18, loan_tenor_years: 2,
        grace_period_months: 0, fixed_assets: 6_000_000,
      },
      // Month-end outstanding balances (the real template input path).
      trade_credit_lines: [
        { id: 'ar1', type: 'receivable', monthly_balance: [2_000_000, 2_500_000, 3_000_000, 2_800_000, 2_600_000, 2_400_000, 2_200_000, 2_000_000, 1_800_000, 1_600_000, 1_400_000, 1_200_000] },
        { id: 'ap1', type: 'payable',    monthly_balance: [1_000_000, 1_400_000, 1_800_000, 1_600_000, 1_500_000, 1_300_000, 1_100_000, 1_000_000, 900_000, 800_000, 700_000, 600_000] },
      ],
    },
    ...overrides,
  })
}

const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps

describe('working capital cash-coverage statement', () => {
  it('reconciles surplus to cf.net and closing to cf.close every month', () => {
    const result = runGenericModel(makeConfig()) as any
    const stmt = computeWorkingCapitalStatement(result)
    expect(stmt.months.length).toBe(result.months)
    stmt.months.forEach((mo, i) => {
      expect(near(mo.surplus, result.cf.net[i])).toBe(true)
      expect(near(mo.closing, result.cf.close[i])).toBe(true)
      // internal identity: totalIn − totalObligations === surplus
      expect(near(mo.totalIn - mo.totalObligations, mo.surplus)).toBe(true)
      // opening + surplus === closing
      expect(near(mo.opening + mo.surplus, mo.closing)).toBe(true)
    })
  })

  it('IAS 7 section subtotals reconcile to engine operating/investing/financing cash', () => {
    const result = runGenericModel(makeConfig()) as any
    const stmt = computeWorkingCapitalStatement(result)
    stmt.months.forEach((mo, i) => {
      expect(near(mo.netOperating, result.cf.op_cash[i])).toBe(true)
      expect(near(mo.netInvesting, result.cf.inv_cash[i])).toBe(true)
      expect(near(mo.netFinancing, result.cf.fin_cash[i])).toBe(true)
      expect(near(mo.netOperating + mo.netInvesting + mo.netFinancing, mo.surplus)).toBe(true)
    })
  })

  it('collections and supplier payments follow revenue/COGS net of balance changes', () => {
    const result = runGenericModel(makeConfig()) as any
    const stmt = computeWorkingCapitalStatement(result)
    // Month 0: AR opens at 2.0m (Δ +2.0m) so collections = 10m − 2m = 8m.
    // AP opens at 1.0m (Δ +1.0m) so supplier payments = 4m − 1m = 3m.
    expect(near(stmt.months[0].collections, 8_000_000, 5)).toBe(true)
    expect(near(stmt.months[0].supplierPayments, 3_000_000, 5)).toBe(true)
    // Month 3: AR falls 3.0m→2.8m (Δ −0.2m) so collections = 10m + 0.2m = 10.2m.
    expect(near(stmt.months[3].collections, 10_200_000, 5)).toBe(true)
  })

  it('surfaces a peak funding need when cash goes negative', () => {
    // Tiny opening cash + big month-0 capex forces an early shortfall.
    const result = runGenericModel(makeConfig({
      settings: {
        shared_cost_fixed_pct: 0, corporate_tax_rate: 0.30, opening_cash_balance: 100_000,
        capital_structure: {
          shareholder_contribution: 0, grant_non_repayable: 0, grant_recoverable: 0,
          bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, grace_period_months: 0,
          fixed_assets: 30_000_000,
        },
        trade_credit_lines: [],
      },
    })) as any
    const stmt = computeWorkingCapitalStatement(result)
    expect(stmt.peakFundingNeed).toBeGreaterThan(0)
    expect(stmt.peakFundingNeed).toBe(-Math.min(...result.cf.close.filter((c: number) => c < 0), 0))
    expect(near(stmt.worstClosing, Math.min(...result.cf.close))).toBe(true)
  })

  it('no trade-credit lines: collections = revenue, payments = COGS', () => {
    const result = runGenericModel(makeConfig({ settings: {
      shared_cost_fixed_pct: 0, corporate_tax_rate: 0.30, opening_cash_balance: 5_000_000,
      capital_structure: { shareholder_contribution: 10_000_000, grant_non_repayable: 0, grant_recoverable: 0, bank_loan: 0, annual_interest_rate: 0.18, loan_tenor_years: 2, grace_period_months: 0, fixed_assets: 0 },
      trade_credit_lines: [],
    } })) as any
    const stmt = computeWorkingCapitalStatement(result)
    stmt.months.forEach((mo, i) => {
      expect(near(mo.collections, result.con.rev[i], 5)).toBe(true)
      expect(near(mo.supplierPayments, result.con.cogs[i], 5)).toBe(true)
      expect(near(mo.closing, result.cf.close[i])).toBe(true)
    })
  })
})
