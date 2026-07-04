import { describe, it, expect } from 'vitest'
import {
  isCostPriceStale, computeExceptionReport, canClosePeriod,
  periodForMonthIndex, monthIndexForPeriod,
  COST_PRICE_STALENESS_DAYS, REVENUE_ANOMALY_THRESHOLD,
  type CatalogueItemForStaleness, type UnitRevenueCheck,
} from '../lib/month-end-close'

const FIXED_NOW = new Date('2026-07-04T00:00:00Z')

function daysAgo(days: number): string {
  return new Date(FIXED_NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('Month-End Close — cost price staleness (IAS 2 review requirement)', () => {
  it('REG: an item with no cost price set is never stale -- it was never claiming to be standard-costed', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Uncosted item', cost_price: null, cost_price_updated_at: null }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(false)
  })

  it('REG: a cost price with no review timestamp at all is stale -- missing data defaults to needing review, not passing silently', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: null }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(true)
  })

  it('REG: a cost price reviewed 89 days ago is NOT yet stale', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(89) }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(false)
  })

  it('REG: a cost price reviewed exactly at the threshold is not yet stale (uses strictly-greater-than)', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(COST_PRICE_STALENESS_DAYS) }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(false)
  })

  it('REG: a cost price reviewed 91 days ago IS stale', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(91) }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(true)
  })

  it('REG: a cost price of exactly zero (a real, deliberate value -- e.g. a donated input) is still checked for staleness like any other', () => {
    const item: CatalogueItemForStaleness = { id: 'c1', name: 'Donated seed', cost_price: 0, cost_price_updated_at: daysAgo(120) }
    expect(isCostPriceStale(item, FIXED_NOW)).toBe(true)
  })
})

describe('Month-End Close — exception report', () => {
  it('REG: a stale cost price produces a BLOCKING exception', () => {
    const items: CatalogueItemForStaleness[] = [{ id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(120) }]
    const report = computeExceptionReport(items, [], FIXED_NOW)
    expect(report).toHaveLength(1)
    expect(report[0].type).toBe('stale_cost_price')
    expect(report[0].severity).toBe('blocking')
  })

  it('REG: a fresh cost price produces no exception', () => {
    const items: CatalogueItemForStaleness[] = [{ id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(10) }]
    expect(computeExceptionReport(items, [], FIXED_NOW)).toHaveLength(0)
  })

  it('REG: a revenue deviation over the threshold produces an INFORMATIONAL exception, not blocking', () => {
    const checks: UnitRevenueCheck[] = [{ unit_id: 'u1', unit_name: 'Shop A', planned_revenue: 1_000_000, actual_revenue: 1_800_000 }] // 80% over
    const report = computeExceptionReport([], checks, FIXED_NOW)
    expect(report).toHaveLength(1)
    expect(report[0].type).toBe('revenue_anomaly')
    expect(report[0].severity).toBe('informational')
  })

  it('REG: a revenue deviation under the threshold produces no exception', () => {
    const checks: UnitRevenueCheck[] = [{ unit_id: 'u1', unit_name: 'Shop A', planned_revenue: 1_000_000, actual_revenue: 1_200_000 }] // 20% over, under the 50% threshold
    expect(computeExceptionReport([], checks, FIXED_NOW)).toHaveLength(0)
  })

  it('REG: a unit with no actual revenue yet is not flagged -- nothing to compare against', () => {
    const checks: UnitRevenueCheck[] = [{ unit_id: 'u1', unit_name: 'Shop A', planned_revenue: 1_000_000, actual_revenue: null }]
    expect(computeExceptionReport([], checks, FIXED_NOW)).toHaveLength(0)
  })

  it('REG: a unit with zero planned revenue is not flagged, avoiding a meaningless divide-by-zero deviation', () => {
    const checks: UnitRevenueCheck[] = [{ unit_id: 'u1', unit_name: 'New Shop', planned_revenue: 0, actual_revenue: 500_000 }]
    expect(computeExceptionReport([], checks, FIXED_NOW)).toHaveLength(0)
  })

  it('REG: multiple exceptions from different sources all appear together in one report', () => {
    const items: CatalogueItemForStaleness[] = [{ id: 'c1', name: 'Fertiliser', cost_price: 8000, cost_price_updated_at: daysAgo(120) }]
    const checks: UnitRevenueCheck[] = [{ unit_id: 'u1', unit_name: 'Shop A', planned_revenue: 1_000_000, actual_revenue: 1_800_000 }]
    const report = computeExceptionReport(items, checks, FIXED_NOW)
    expect(report).toHaveLength(2)
  })
})

describe('Month-End Close — the hard gate', () => {
  it('REG: a period with a blocking exception cannot close', () => {
    const report = [{ type: 'stale_cost_price' as const, severity: 'blocking' as const, message: 'x', ref_id: 'c1' }]
    expect(canClosePeriod(report)).toBe(false)
  })

  it('REG: a period with only informational exceptions CAN close', () => {
    const report = [{ type: 'revenue_anomaly' as const, severity: 'informational' as const, message: 'x', ref_id: 'u1' }]
    expect(canClosePeriod(report)).toBe(true)
  })

  it('REG: a period with a mix of blocking and informational exceptions cannot close -- any single blocking item is enough', () => {
    const report = [
      { type: 'revenue_anomaly' as const, severity: 'informational' as const, message: 'x', ref_id: 'u1' },
      { type: 'stale_cost_price' as const, severity: 'blocking' as const, message: 'y', ref_id: 'c1' },
    ]
    expect(canClosePeriod(report)).toBe(false)
  })

  it('REG: a period with zero exceptions can close', () => {
    expect(canClosePeriod([])).toBe(true)
  })
})

describe('Month-End Close — UTC-safe period/month-index arithmetic', () => {
  it('REG: periodForMonthIndex returns the exact start period at index 0', () => {
    expect(periodForMonthIndex('2026-01-01', 0)).toBe('2026-01-01')
  })

  it('REG: periodForMonthIndex advances months correctly, including across a year boundary', () => {
    expect(periodForMonthIndex('2026-11-01', 0)).toBe('2026-11-01')
    expect(periodForMonthIndex('2026-11-01', 1)).toBe('2026-12-01')
    expect(periodForMonthIndex('2026-11-01', 2)).toBe('2027-01-01') // crosses into the next year
  })

  it('REG: monthIndexForPeriod is the exact inverse of periodForMonthIndex', () => {
    const start = '2026-03-01'
    for (let i = 0; i < 15; i++) {
      const period = periodForMonthIndex(start, i)
      expect(monthIndexForPeriod(start, period)).toBe(i)
    }
  })

  it('REG: date-only strings never shift by a day regardless of local timezone -- both functions use UTC parts consistently', () => {
    // This is the exact bug CodeRabbit caught: new Date('2026-01-01') is
    // UTC midnight, but local getFullYear()/getMonth() can reinterpret
    // that a day earlier in negative UTC offsets, landing in the wrong
    // month. Using UTC parts throughout avoids this regardless of which
    // timezone the test runner (or a user's browser) happens to be in.
    expect(periodForMonthIndex('2026-01-01', 0)).toBe('2026-01-01')
    expect(monthIndexForPeriod('2026-01-01', '2026-01-01')).toBe(0)
  })
})
