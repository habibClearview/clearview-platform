import { describe, it, expect } from 'vitest'
import {
  syntheticPlanLinesFromEvents,
  isMarketEventLineId,
  MARKET_EVENT_LINE_PREFIX,
  type MarketEvent,
} from '../lib/market-events'

const START = '2026-01-01' // plan month 0 = Jan 2026

function ev(partial: Partial<MarketEvent>): MarketEvent {
  return {
    id: 'e1', client_id: 'c1', unit_id: 'u1', name: 'Radio campaign',
    cost: 1200, start_period: '2026-04-01', months_count: 1,
    cost_category: 'direct_opex', status: 'approved',
    ...partial,
  }
}

describe('syntheticPlanLinesFromEvents — which events produce a line', () => {
  it('REG: an approved event with a unit and positive cost produces one line', () => {
    const lines = syntheticPlanLinesFromEvents([ev({})], START, 24)
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe(`${MARKET_EVENT_LINE_PREFIX}e1`)
    expect(lines[0].unit_id).toBe('u1')
    expect(lines[0].category).toBe('direct_opex')
    expect(lines[0].name).toContain('Radio campaign')
  })

  it('REG: proposed / rejected events produce nothing (only approved flows to P&L)', () => {
    expect(syntheticPlanLinesFromEvents([ev({ status: 'proposed' })], START, 24)).toHaveLength(0)
    expect(syntheticPlanLinesFromEvents([ev({ status: 'rejected' })], START, 24)).toHaveLength(0)
  })

  it('REG: an event with no target unit is skipped', () => {
    expect(syntheticPlanLinesFromEvents([ev({ unit_id: null })], START, 24)).toHaveLength(0)
  })

  it('REG: zero or negative cost is skipped', () => {
    expect(syntheticPlanLinesFromEvents([ev({ cost: 0 })], START, 24)).toHaveLength(0)
    expect(syntheticPlanLinesFromEvents([ev({ cost: -50 })], START, 24)).toHaveLength(0)
  })
})

describe('syntheticPlanLinesFromEvents — month placement & spreading', () => {
  it('REG: a single-month event puts the whole cost in the right month slot', () => {
    // start_period Apr 2026 = month index 3 from Jan 2026 start
    const lines = syntheticPlanLinesFromEvents([ev({ start_period: '2026-04-01', months_count: 1, cost: 1200 })], START, 24)
    const mp = lines[0].monthly_plan
    expect(mp).toHaveLength(24)
    expect(mp[3]).toBe(1200)
    expect(mp.reduce((a, b) => a + b, 0)).toBe(1200)
    expect(mp[2]).toBe(0)
    expect(mp[4]).toBe(0)
  })

  it('REG: a multi-month event spreads the cost evenly across consecutive months', () => {
    const lines = syntheticPlanLinesFromEvents([ev({ start_period: '2026-02-01', months_count: 3, cost: 900 })], START, 24)
    const mp = lines[0].monthly_plan
    expect(mp[1]).toBe(300) // Feb
    expect(mp[2]).toBe(300) // Mar
    expect(mp[3]).toBe(300) // Apr
    expect(mp.reduce((a, b) => a + b, 0)).toBe(900)
  })

  it('REG: months falling outside the planning window are dropped (their share is not shown)', () => {
    // 3-month event starting at month 23 (last slot) — only 1 of 3 months is in-window
    const lines = syntheticPlanLinesFromEvents([ev({ start_period: '2027-12-01', months_count: 3, cost: 900 })], START, 24)
    const mp = lines[0].monthly_plan
    expect(mp[23]).toBe(300)          // only the in-window month shows its 1/3 share
    expect(mp.reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('REG: an event entirely before the window produces no line at all', () => {
    const lines = syntheticPlanLinesFromEvents([ev({ start_period: '2025-01-01', months_count: 1 })], START, 24)
    expect(lines).toHaveLength(0)
  })

  it('REG: monthly_plan always has exactly planningMonths entries (engine requirement)', () => {
    const lines = syntheticPlanLinesFromEvents([ev({})], START, 18)
    expect(lines[0].monthly_plan).toHaveLength(18)
  })
})

describe('syntheticPlanLinesFromEvents — category', () => {
  it('REG: cost_of_sales events land in the cost_of_sales bucket', () => {
    const lines = syntheticPlanLinesFromEvents([ev({ cost_category: 'cost_of_sales' })], START, 24)
    expect(lines[0].category).toBe('cost_of_sales')
  })
})

describe('isMarketEventLineId', () => {
  it('REG: recognises event-derived line ids and rejects ordinary ones', () => {
    expect(isMarketEventLineId(`${MARKET_EVENT_LINE_PREFIX}abc`)).toBe(true)
    expect(isMarketEventLineId('rev_123')).toBe(false)
    expect(isMarketEventLineId(undefined)).toBe(false)
    expect(isMarketEventLineId(null)).toBe(false)
  })
})
