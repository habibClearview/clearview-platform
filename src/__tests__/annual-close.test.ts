import { describe, it, expect } from 'vitest'
import {
  getFiscalYears, canCloseYear, computeAnnualPL, computeAnnualCashFlow, computeYearEndBalanceSheet,
} from '../lib/annual-close'
import { periodForMonthIndex } from '../lib/month-end-close'

describe('Annual Close — fiscal year boundaries', () => {
  it('REG: a 24-month planning window produces exactly two complete fiscal years', () => {
    const years = getFiscalYears('2026-01-01', 24, periodForMonthIndex)
    expect(years).toHaveLength(2)
    expect(years[0]).toMatchObject({ yearIndex: 0, startMonthIndex: 0, endMonthIndex: 11, startPeriod: '2026-01-01', isComplete: true })
    expect(years[1]).toMatchObject({ yearIndex: 1, startMonthIndex: 12, endMonthIndex: 23, startPeriod: '2027-01-01', isComplete: true })
  })

  it('REG: a 12-month planning window produces exactly one complete fiscal year', () => {
    const years = getFiscalYears('2026-01-01', 12, periodForMonthIndex)
    expect(years).toHaveLength(1)
    expect(years[0].isComplete).toBe(true)
  })

  it('REG: a trailing partial year (not a multiple of 12) is marked incomplete, not silently dropped or padded', () => {
    const years = getFiscalYears('2026-01-01', 15, periodForMonthIndex)
    expect(years).toHaveLength(2)
    expect(years[0].isComplete).toBe(true)
    expect(years[1]).toMatchObject({ startMonthIndex: 12, endMonthIndex: 14, isComplete: false })
  })

  it('REG: a fiscal year not starting in January still gets correct period boundaries', () => {
    const years = getFiscalYears('2026-07-01', 24, periodForMonthIndex)
    expect(years[0].startPeriod).toBe('2026-07-01')
    expect(years[1].startPeriod).toBe('2027-07-01')
  })
})

describe('Annual Close — the hard gate on closing a year', () => {
  const year0 = { yearIndex: 0, startMonthIndex: 0, endMonthIndex: 11, startPeriod: '2026-01-01', isComplete: true }

  it('REG: a year cannot close if even one of its 12 months is not individually closed', () => {
    const closedPeriods = new Set<string>()
    for (let m = 0; m < 11; m++) closedPeriods.add(periodForMonthIndex('2026-01-01', m)) // 11 of 12 closed
    expect(canCloseYear(year0, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(false)
  })

  it('REG: a year CAN close once every one of its 12 months is individually closed', () => {
    const closedPeriods = new Set<string>()
    for (let m = 0; m < 12; m++) closedPeriods.add(periodForMonthIndex('2026-01-01', m))
    expect(canCloseYear(year0, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(true)
  })

  it('REG: an incomplete trailing year (fewer than 12 months) can never close, even if all its months are individually closed', () => {
    const partialYear = { yearIndex: 1, startMonthIndex: 12, endMonthIndex: 14, startPeriod: '2027-01-01', isComplete: false }
    const closedPeriods = new Set<string>()
    for (let m = 12; m <= 14; m++) closedPeriods.add(periodForMonthIndex('2026-01-01', m))
    expect(canCloseYear(partialYear, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(false)
  })

  it('REG: closing year 2 does not require year 1 to also be closed -- each year gates independently on its own months', () => {
    const year1 = { yearIndex: 1, startMonthIndex: 12, endMonthIndex: 23, startPeriod: '2027-01-01', isComplete: true }
    const closedPeriods = new Set<string>()
    for (let m = 12; m < 24; m++) closedPeriods.add(periodForMonthIndex('2026-01-01', m)) // only year 2's months closed
    expect(canCloseYear(year1, closedPeriods, periodForMonthIndex, '2026-01-01')).toBe(true)
  })
})

describe('Annual Close — aggregation is pure summing/snapshotting of already-correct monthly figures', () => {
  const year0 = { yearIndex: 0, startMonthIndex: 0, endMonthIndex: 2, startPeriod: '2026-01-01', isComplete: true } // 3-month year for a small test

  it('REG: Annual P&L sums exactly the months within the year range, nothing outside it', () => {
    const con = {
      rev: [100, 200, 300, 9999], cogs: [10, 20, 30, 9999], gp: [90, 180, 270, 9999],
      opex: [5, 5, 5, 9999], ebitda: [85, 175, 265, 9999], interest: [1, 1, 1, 9999],
      nbt: [84, 174, 264, 9999], tax: [10, 20, 30, 9999], npat: [74, 154, 234, 9999],
    }
    const annual = computeAnnualPL(con, year0)
    expect(annual.rev).toBe(600) // 100+200+300, NOT including the 9999 in month index 3
    expect(annual.npat).toBe(462) // 74+154+234
  })

  it('REG: Annual Cash Flow sums flows across the year, but opening/closing cash are point-in-time, not summed', () => {
    const cf = {
      open: [1000, 1100, 1250, 99999], op_cash: [100, 150, 200, 99999],
      fin_cash: [0, 0, 0, 99999], inv_cash: [0, 0, 0, 99999],
      net: [100, 150, 200, 99999], close: [1100, 1250, 1450, 99999],
    }
    const annual = computeAnnualCashFlow(cf, year0)
    expect(annual.openingCash).toBe(1000) // opening balance of the FIRST month, not summed
    expect(annual.closingCash).toBe(1450) // closing balance of the LAST month, not summed
    expect(annual.operatingCash).toBe(450) // 100+150+200, correctly summed
  })

  it('REG: Year-End Balance Sheet is the LAST month of the year, not a sum or average -- a balance sheet is a snapshot', () => {
    const bs = {
      cash: [1100, 1250, 1450, 99999], fixed_assets: [500, 500, 500, 99999],
      accounts_receivable: [50, 60, 70, 99999], total_assets: [1650, 1810, 2020, 99999],
      share_capital: [1000, 1000, 1000, 99999], grant_equity: [0, 0, 0, 99999],
      retained_earnings: [650, 810, 1020, 99999], total_equity: [1650, 1810, 2020, 99999],
      grant_liability: [0, 0, 0, 99999], loan_liability: [0, 0, 0, 99999],
      accounts_payable: [0, 0, 0, 99999], total_liabilities: [0, 0, 0, 99999],
      total_equity_and_liabilities: [1650, 1810, 2020, 99999],
    }
    const yearEnd = computeYearEndBalanceSheet(bs, year0)
    expect(yearEnd.cash).toBe(1450) // month index 2 (the last month of this 3-month test year), not summed
    expect(yearEnd.retainedEarnings).toBe(1020)
  })
})
