import { describe, it, expect } from 'vitest'
import {
  yearStartPeriod, canCloseCalendarYear, computeAnnualPL, computeAnnualCashFlow, computeYearEndBalanceSheet,
} from '../lib/annual-close'
import { periodForMonthIndex } from '../lib/month-end-close'
import { buildYearGroups } from '../lib/generic-engine'

describe('Annual Close — calendar year boundaries (buildYearGroups)', () => {
  // buildYearGroups itself is already thoroughly tested in
  // generic-engine.test.ts -- these confirm the annual-close functions
  // correctly consume what it produces, for the exact scenario this
  // whole redesign was for: a client whose start_date isn't January 1st.

  it('REG: yearStartPeriod uses the FIRST month this calendar year actually contains, not January 1st, for a client starting mid-year', () => {
    const groups = buildYearGroups('2026-04-02', 24) // Apr 2026 - Mar 2028
    const year2026 = groups.find(g => g.year === 2026)!
    expect(yearStartPeriod(year2026, periodForMonthIndex, '2026-04-02')).toBe('2026-04-01')
  })

  it('REG: yearStartPeriod for a full calendar year in the middle of the range is January 1st', () => {
    const groups = buildYearGroups('2026-04-02', 24)
    const year2027 = groups.find(g => g.year === 2027)!
    expect(yearStartPeriod(year2027, periodForMonthIndex, '2026-04-02')).toBe('2027-01-01')
  })
})

describe('Annual Close — the hard gate on closing a calendar year', () => {
  it('REG: a partial first year (fewer than 12 months) CAN close once every one of ITS months is individually closed -- this is the core fix, a partial year is a legitimate, closeable period', () => {
    const groups = buildYearGroups('2026-04-02', 24)
    const year2026 = groups.find(g => g.year === 2026)! // Apr-Dec, 9 months
    const closedPeriods = new Set<string>()
    for (const m of year2026.monthIndices) closedPeriods.add(periodForMonthIndex('2026-04-02', m))
    expect(canCloseCalendarYear(year2026, closedPeriods, periodForMonthIndex, '2026-04-02')).toBe(true)
  })

  it('REG: a year cannot close if even one of its months is not individually closed', () => {
    const groups = buildYearGroups('2026-04-02', 24)
    const year2026 = groups.find(g => g.year === 2026)!
    const closedPeriods = new Set<string>()
    for (const m of year2026.monthIndices.slice(0, -1)) closedPeriods.add(periodForMonthIndex('2026-04-02', m)) // all but the last
    expect(canCloseCalendarYear(year2026, closedPeriods, periodForMonthIndex, '2026-04-02')).toBe(false)
  })

  it('REG: a full 12-month calendar year CAN close once every one of its months is individually closed', () => {
    const groups = buildYearGroups('2026-01-01', 24)
    const year2026 = groups.find(g => g.year === 2026)!
    const closedPeriods = new Set<string>()
    for (const m of year2026.monthIndices) closedPeriods.add(periodForMonthIndex('2026-01-01', m))
    expect(canCloseCalendarYear(year2026, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(true)
  })

  it('REG: a future year (none of its months have happened yet, let alone been closed) can never close', () => {
    const groups = buildYearGroups('2026-01-01', 24)
    const year2027 = groups.find(g => g.year === 2027)!
    const closedPeriods = new Set<string>() // nothing closed at all
    expect(canCloseCalendarYear(year2027, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(false)
  })

  it('REG: closing 2027 does not require 2026 to also be closed -- each year gates independently on its own months', () => {
    const groups = buildYearGroups('2026-01-01', 24)
    const year2027 = groups.find(g => g.year === 2027)!
    const closedPeriods = new Set<string>()
    for (const m of year2027.monthIndices) closedPeriods.add(periodForMonthIndex('2026-01-01', m)) // only 2027's months closed
    expect(canCloseCalendarYear(year2027, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(true)
  })
})

describe('Annual Close — aggregation is pure summing/snapshotting of already-correct monthly figures', () => {
  const range = { startMonthIndex: 0, endMonthIndex: 2 } // a simple 3-month range for a small test

  it('REG: Annual P&L sums exactly the months within the range, nothing outside it', () => {
    const con = {
      rev: [100, 200, 300, 9999], cogs: [10, 20, 30, 9999], gp: [90, 180, 270, 9999],
      opex: [5, 5, 5, 9999], ebitda: [85, 175, 265, 9999], interest: [1, 1, 1, 9999],
      nbt: [84, 174, 264, 9999], tax: [10, 20, 30, 9999], npat: [74, 154, 234, 9999],
    }
    const annual = computeAnnualPL(con, range)
    expect(annual.rev).toBe(600) // 100+200+300, NOT including the 9999 in month index 3
    expect(annual.npat).toBe(462) // 74+154+234
  })

  it('REG: Annual Cash Flow sums flows across the range, but opening/closing cash are point-in-time, not summed', () => {
    const cf = {
      open: [1000, 1100, 1250, 99999], op_cash: [100, 150, 200, 99999],
      fin_cash: [0, 0, 0, 99999], inv_cash: [0, 0, 0, 99999],
      net: [100, 150, 200, 99999], close: [1100, 1250, 1450, 99999],
    }
    const annual = computeAnnualCashFlow(cf, range)
    expect(annual.openingCash).toBe(1000) // opening balance of the FIRST month, not summed
    expect(annual.closingCash).toBe(1450) // closing balance of the LAST month, not summed
    expect(annual.operatingCash).toBe(450) // 100+150+200, correctly summed
  })

  it('REG: Year-End Balance Sheet is the LAST month of the range, not a sum or average -- a balance sheet is a snapshot', () => {
    const bs = {
      cash: [1100, 1250, 1450, 99999], fixed_assets: [500, 500, 500, 99999],
      accounts_receivable: [50, 60, 70, 99999], total_assets: [1650, 1810, 2020, 99999],
      share_capital: [1000, 1000, 1000, 99999], grant_equity: [0, 0, 0, 99999],
      retained_earnings: [650, 810, 1020, 99999], total_equity: [1650, 1810, 2020, 99999],
      grant_liability: [0, 0, 0, 99999], loan_liability: [0, 0, 0, 99999],
      accounts_payable: [0, 0, 0, 99999], total_liabilities: [0, 0, 0, 99999],
      total_equity_and_liabilities: [1650, 1810, 2020, 99999],
    }
    const yearEnd = computeYearEndBalanceSheet(bs, range)
    expect(yearEnd.cash).toBe(1450) // month index 2 (the last month of this 3-month test range), not summed
    expect(yearEnd.retainedEarnings).toBe(1020)
  })

  it('REG: annual helpers can be driven from a YearGroup-derived contiguous range', () => {
    // YearGroup has extra fields (year, label, monthIndices) beyond
    // startMonthIndex/endMonthIndex -- but since a calendar year's
    // monthIndices are always contiguous, deriving start/end from it
    // and passing that through works identically.
    const groups = buildYearGroups('2026-04-02', 24)
    const year2026 = groups.find(g => g.year === 2026)!
    const derivedRange = { startMonthIndex: year2026.monthIndices[0], endMonthIndex: year2026.monthIndices[year2026.monthIndices.length - 1] }
    const con = { rev: Array(9).fill(100), cogs: Array(9).fill(10), gp: Array(9).fill(90), opex: Array(9).fill(5), ebitda: Array(9).fill(85), interest: Array(9).fill(1), nbt: Array(9).fill(84), tax: Array(9).fill(10), npat: Array(9).fill(74) }
    const annual = computeAnnualPL(con, derivedRange)
    expect(annual.rev).toBe(900) // 9 months of 100
  })
})
