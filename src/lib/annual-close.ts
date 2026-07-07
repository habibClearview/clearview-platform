// Annual figures and Year-End Close. Per docs/ACCOUNTING_ARCHITECTURE.md
// section 6.
//
// Deliberately NOT a new parallel calculation: the monthly engine
// (generic-engine.ts) already correctly carries cash and retained
// earnings forward continuously across the whole planning window,
// including hybrid actuals (see the BS/CF hybrid work). A "year" here is
// purely a grouping of figures the engine has already computed
// correctly -- Annual P&L is a sum of a year's P&L; Year-End Balance
// Sheet is simply the last of those months' already-correct BS; Annual
// Cash Flow is a sum of a year's cash flow. Year-End Close is a
// separate, bigger ceremony on top of month-end close (which already
// individually locks each month at the database level) -- it requires
// every month in the year to already be closed, then captures a
// permanent snapshot and formally marks the year itself as closed.
//
// Years here are CALENDAR years (Jan-Dec), matching buildYearGroups()
// in generic-engine.ts -- the same grouping the collapsible P&L/Balance
// Sheet/Cash Flow views use. This replaces an earlier version built
// around rolling 12-month blocks from the model's start_date (so a
// client starting in April would have "Year 1" = Apr-Mar), which never
// matched how anyone actually thinks about a fiscal year in
// conversation or reporting. A calendar year's FIRST or LAST block in
// the model can legitimately be shorter than 12 months (a business
// starting to track in April has a genuine, closeable first "year" of
// only 9 months) -- treated as closeable once every month it actually
// contains is closed, not rejected for being short of 12.

import type { YearGroup } from './generic-engine'

// The database key for a calendar year's close record: the period
// (YYYY-MM-01) of the FIRST month this calendar year actually contains
// within the model's planning window -- for a client starting in April,
// year 2026's key is 2026-04-01, not 2026-01-01 (which the model has no
// data for at all). Matches generic_period_close.period for that month,
// giving an unambiguous join key.
export function yearStartPeriod(group: YearGroup, periodForMonthIndexFn: (startDate: string, monthIndex: number) => string, startDate: string): string {
  return periodForMonthIndexFn(startDate, group.monthIndices[0])
}

// A calendar year can only be closed once EVERY month it actually
// contains (whatever that count is -- 3, 9, or 12) is already
// individually closed via month-end close. This is the gate, not a new
// independent lock. A future or in-progress year is naturally excluded
// by this same check, since a month that hasn't happened yet can never
// be closed.
export function canCloseCalendarYear(group: YearGroup, closedPeriods: Set<string>, periodForMonthIndexFn: (startDate: string, monthIndex: number) => string, startDate: string): boolean {
  for (const m of group.monthIndices) {
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
// calendar year's month range. No new figures are computed here -- this
// is purely aggregation of numbers the engine already produced. Accepts
// any {startMonthIndex, endMonthIndex} range, not specifically a
// YearGroup -- both a full calendar year's contiguous monthIndices and
// this simpler range shape describe the same thing (a calendar year is
// always contiguous within the planning window), so callers can pass
// either.
export function computeAnnualPL(con: {
  rev: number[]; cogs: number[]; gp: number[]; opex: number[]; ebitda: number[];
  interest: number[]; nbt: number[]; tax: number[]; npat: number[];
}, range: {startMonthIndex: number; endMonthIndex: number}): AnnualPL {
  const sum = (arr: number[]) => arr.slice(range.startMonthIndex, range.endMonthIndex + 1).reduce((s, v) => s + v, 0)
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
}, range: {startMonthIndex: number; endMonthIndex: number}): AnnualCashFlow {
  const sum = (arr: number[]) => arr.slice(range.startMonthIndex, range.endMonthIndex + 1).reduce((s, v) => s + v, 0)
  return {
    openingCash: cf.open[range.startMonthIndex],
    operatingCash: sum(cf.op_cash),
    financingCash: sum(cf.fin_cash),
    investingCash: sum(cf.inv_cash),
    netChange: sum(cf.net),
    closingCash: cf.close[range.endMonthIndex],
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
}, range: {startMonthIndex: number; endMonthIndex: number}): YearEndBalanceSheet {
  const m = range.endMonthIndex
  return {
    cash: bs.cash[m], fixedAssets: bs.fixed_assets[m], accountsReceivable: bs.accounts_receivable[m],
    totalAssets: bs.total_assets[m], shareCapital: bs.share_capital[m], grantEquity: bs.grant_equity[m],
    retainedEarnings: bs.retained_earnings[m], totalEquity: bs.total_equity[m],
    grantLiability: bs.grant_liability[m], loanLiability: bs.loan_liability[m],
    accountsPayable: bs.accounts_payable[m], totalLiabilities: bs.total_liabilities[m],
    totalEquityAndLiabilities: bs.total_equity_and_liabilities[m],
  }
}
