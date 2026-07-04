// Annual figures and Year-End Close. Per docs/ACCOUNTING_ARCHITECTURE.md
// section 6.
//
// Deliberately NOT a new parallel calculation: the monthly engine
// (generic-engine.ts) already correctly carries cash and retained
// earnings forward continuously across the whole planning window,
// including hybrid actuals (see the BS/CF hybrid work). A "year" here is
// purely a 12-month grouping of figures the engine has already computed
// correctly -- Annual P&L is a sum of 12 months' P&L; Year-End Balance
// Sheet is simply the last of those 12 months' already-correct BS; Annual
// Cash Flow is a sum of 12 months' cash flow. Year-End Close is a
// separate, bigger ceremony on top of month-end close (which already
// individually locks each month at the database level) -- it requires
// every month in the year to already be closed, then captures a
// permanent snapshot and formally marks the year itself as closed.

export interface FiscalYear {
  yearIndex: number       // 0-based: first 12 months = year 0, next 12 = year 1, etc.
  startMonthIndex: number // inclusive, 0-based month index into the engine's arrays
  endMonthIndex: number   // inclusive
  startPeriod: string     // YYYY-MM-01, matches generic_period_close.period for month 1 of this year
  isComplete: boolean     // false for a trailing partial year (planning_months not a multiple of 12)
}

// Every full or partial 12-month block within the planning window.
// Reuses the same UTC-safe period arithmetic already proven for month-end
// close (periodForMonthIndex in month-end-close.ts) rather than a new
// date computation -- this avoids reintroducing the exact timezone bug
// already found and fixed there.
export function getFiscalYears(startDate: string, planningMonths: number, periodForMonthIndexFn: (startDate: string, monthIndex: number) => string): FiscalYear[] {
  const years: FiscalYear[] = []
  for (let start = 0; start < planningMonths; start += 12) {
    const end = Math.min(start + 11, planningMonths - 1)
    years.push({
      yearIndex: start / 12,
      startMonthIndex: start,
      endMonthIndex: end,
      startPeriod: periodForMonthIndexFn(startDate, start),
      isComplete: (end - start + 1) === 12,
    })
  }
  return years
}

// A year can only be closed once EVERY month within it is already
// individually closed (via month-end close) -- this is the gate, not a
// new independent lock. Also refuses an incomplete trailing year (fewer
// than 12 months in the planning window) -- there's nothing to formally
// close yet.
export function canCloseYear(year: FiscalYear, closedPeriods: Set<string>, periodForMonthIndexFn: (startDate: string, monthIndex: number) => string, startDate: string): boolean {
  if (!year.isComplete) return false
  for (let m = year.startMonthIndex; m <= year.endMonthIndex; m++) {
    if (!closedPeriods.has(periodForMonthIndexFn(startDate, m))) return false
  }
  return true
}

export interface AnnualPL {
  rev: number
  cogs: number
  gp: number
  opex: number
  ebitda: number
  interest: number
  nbt: number
  tax: number
  npat: number
}

// Sums the engine's already-correct monthly consolidated arrays over one
// fiscal year's month range. No new figures are computed here -- this is
// purely aggregation of numbers the engine already produced.
export function computeAnnualPL(con: {
  rev: number[]; cogs: number[]; gp: number[]; opex: number[]; ebitda: number[];
  interest: number[]; nbt: number[]; tax: number[]; npat: number[];
}, year: FiscalYear): AnnualPL {
  const sum = (arr: number[]) => arr.slice(year.startMonthIndex, year.endMonthIndex + 1).reduce((s, v) => s + v, 0)
  return {
    rev: sum(con.rev), cogs: sum(con.cogs), gp: sum(con.gp), opex: sum(con.opex),
    ebitda: sum(con.ebitda), interest: sum(con.interest), nbt: sum(con.nbt),
    tax: sum(con.tax), npat: sum(con.npat),
  }
}

export interface AnnualCashFlow {
  openingCash: number
  operatingCash: number
  financingCash: number
  investingCash: number
  netChange: number
  closingCash: number
}

export function computeAnnualCashFlow(cf: {
  open: number[]; op_cash: number[]; fin_cash: number[]; inv_cash: number[]; net: number[]; close: number[];
}, year: FiscalYear): AnnualCashFlow {
  const sum = (arr: number[]) => arr.slice(year.startMonthIndex, year.endMonthIndex + 1).reduce((s, v) => s + v, 0)
  return {
    openingCash: cf.open[year.startMonthIndex],
    operatingCash: sum(cf.op_cash),
    financingCash: sum(cf.fin_cash),
    investingCash: sum(cf.inv_cash),
    netChange: sum(cf.net),
    closingCash: cf.close[year.endMonthIndex],
  }
}

// Year-End Balance Sheet is simply the LAST month's already-correct
// balance sheet -- a balance sheet is a point-in-time snapshot, not
// something summed across a year the way P&L/Cash Flow are.
export interface YearEndBalanceSheet {
  cash: number
  fixedAssets: number
  accountsReceivable: number
  totalAssets: number
  shareCapital: number
  grantEquity: number
  retainedEarnings: number
  totalEquity: number
  grantLiability: number
  loanLiability: number
  accountsPayable: number
  totalLiabilities: number
  totalEquityAndLiabilities: number
}

export function computeYearEndBalanceSheet(bs: {
  cash: number[]; fixed_assets: number[]; accounts_receivable: number[]; total_assets: number[];
  share_capital: number[]; grant_equity: number[]; retained_earnings: number[]; total_equity: number[];
  grant_liability: number[]; loan_liability: number[]; accounts_payable: number[]; total_liabilities: number[];
  total_equity_and_liabilities: number[];
}, year: FiscalYear): YearEndBalanceSheet {
  const m = year.endMonthIndex
  return {
    cash: bs.cash[m], fixedAssets: bs.fixed_assets[m], accountsReceivable: bs.accounts_receivable[m],
    totalAssets: bs.total_assets[m], shareCapital: bs.share_capital[m], grantEquity: bs.grant_equity[m],
    retainedEarnings: bs.retained_earnings[m], totalEquity: bs.total_equity[m],
    grantLiability: bs.grant_liability[m], loanLiability: bs.loan_liability[m],
    accountsPayable: bs.accounts_payable[m], totalLiabilities: bs.total_liabilities[m],
    totalEquityAndLiabilities: bs.total_equity_and_liabilities[m],
  }
}
