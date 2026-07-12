import { describe, it, expect } from 'vitest'
import {
  engagementSplit, independentClients, feesReceivedInYear, outstandingInvoiced,
  averageDaysToCollect, revenueStreams, dealCards, type FeeClient, type DealProgramme,
} from '../lib/coach-business-metrics'

function client(over: Partial<FeeClient> = {}): FeeClient {
  return { id: 'c1', engagement_mode: 'canvas', programme_id: 'p1', ...over }
}

describe('engagementSplit', () => {
  it('splits by engagement_mode', () => {
    const r = engagementSplit([
      client({ id: 'a', engagement_mode: 'canvas' }),
      client({ id: 'b', engagement_mode: 'canvas' }),
      client({ id: 'c', engagement_mode: 'financial' }),
    ])
    expect(r).toEqual({ total: 3, gtcv: 2, clearview: 1 })
  })
  it('handles an empty list', () => {
    expect(engagementSplit([])).toEqual({ total: 0, gtcv: 0, clearview: 0 })
  })
})

describe('independentClients', () => {
  it('counts clients with no programme_id and shares their fee value', () => {
    const r = independentClients([
      client({ id: 'a', programme_id: null, engagement_fee: 30_000 }),
      client({ id: 'b', programme_id: 'p1', engagement_fee: 70_000 }),
    ])
    expect(r.count).toBe(1)
    expect(r.revenueShare).toBeCloseTo(0.3)
  })
  it('treats an empty-string programme_id as independent too', () => {
    const r = independentClients([client({ programme_id: '', engagement_fee: 100 })])
    expect(r.count).toBe(1)
  })
  it('revenue share is 0 when no fees are set at all (not NaN)', () => {
    const r = independentClients([client({ engagement_fee: null })])
    expect(r.revenueShare).toBe(0)
  })
})

describe('feesReceivedInYear', () => {
  it('sums only paid fees whose fee_paid_at falls in the given year', () => {
    const clients = [
      client({ fee_status: 'paid', fee_paid_at: '2026-03-01', engagement_fee: 10_000 }),
      client({ fee_status: 'paid', fee_paid_at: '2025-12-01', engagement_fee: 5_000 }),
      client({ fee_status: 'invoiced', fee_paid_at: null, engagement_fee: 8_000 }),
    ]
    expect(feesReceivedInYear(clients, 2026)).toBe(10_000)
  })
  it('ignores paid fees with no recorded payment date', () => {
    const r = feesReceivedInYear([client({ fee_status: 'paid', fee_paid_at: null, engagement_fee: 999 })], 2026)
    expect(r).toBe(0)
  })
})

describe('outstandingInvoiced', () => {
  it('sums fees currently marked invoiced', () => {
    const r = outstandingInvoiced([
      client({ fee_status: 'invoiced', engagement_fee: 20_000 }),
      client({ fee_status: 'paid', engagement_fee: 5_000 }),
      client({ fee_status: 'unpaid', engagement_fee: 1_000 }),
    ])
    expect(r).toBe(20_000)
  })
})

describe('averageDaysToCollect', () => {
  it('returns null when there is no settled data yet (not 0)', () => {
    expect(averageDaysToCollect([client({ fee_status: 'unpaid' })])).toBeNull()
  })
  it('averages days between invoiced and paid dates for paid fees', () => {
    const clients = [
      client({ fee_status: 'paid', fee_invoiced_at: '2026-01-01', fee_paid_at: '2026-01-31' }), // 30d
      client({ fee_status: 'paid', fee_invoiced_at: '2026-02-01', fee_paid_at: '2026-04-01' }), // 59d
    ]
    expect(averageDaysToCollect(clients)).toBeCloseTo(44.5, 0)
  })
  it('ignores a paid fee missing one of the two dates', () => {
    const clients = [
      client({ fee_status: 'paid', fee_invoiced_at: '2026-01-01', fee_paid_at: '2026-01-11' }), // 10d
      client({ fee_status: 'paid', fee_invoiced_at: null, fee_paid_at: '2026-01-11' }),
    ]
    expect(averageDaysToCollect(clients)).toBeCloseTo(10, 0)
  })
})

describe('revenueStreams', () => {
  const programmesById: Record<string, DealProgramme> = {
    donor1: { id: 'donor1', name: 'Palladium', type: 'donor_programme' },
  }
  it('buckets programme-funded, self-funded GtCV, and Clearview subscriptions correctly', () => {
    const clients = [
      client({ id: 'a', programme_id: 'donor1', engagement_fee: 112_000, engagement_mode: 'canvas' }),
      client({ id: 'b', programme_id: null, engagement_mode: 'canvas', engagement_fee: 34_000 }),
      client({ id: 'c', programme_id: null, engagement_mode: 'financial', engagement_fee: 36_000 }),
    ]
    const r = revenueStreams(clients, programmesById)
    const byKey = Object.fromEntries(r.streams.map(s => [s.key, s.value]))
    expect(byKey.programme_advisory).toBe(112_000)
    expect(byKey.self_funded_gtcv).toBe(34_000)
    expect(byKey.clearview_subscriptions).toBe(36_000)
    expect(r.total).toBe(182_000)
  })
  it('bar fractions are relative to the largest stream, capping at 1', () => {
    const clients = [
      client({ id: 'a', programme_id: 'donor1', engagement_fee: 100, engagement_mode: 'canvas' }),
      client({ id: 'b', programme_id: null, engagement_mode: 'canvas', engagement_fee: 50 }),
    ]
    const r = revenueStreams(clients, programmesById)
    const byKey = Object.fromEntries(r.streams.map(s => [s.key, s.barFrac]))
    expect(byKey.programme_advisory).toBe(1)
    expect(byKey.self_funded_gtcv).toBe(0.5)
  })
  it('handles no revenue at all without dividing by zero', () => {
    const r = revenueStreams([], {})
    expect(r.total).toBe(0)
    expect(r.streams.every(s => Number.isFinite(s.barFrac))).toBe(true)
  })
})

describe('dealCards', () => {
  function prog(over: Partial<DealProgramme> = {}): DealProgramme {
    return { id: 'x', name: 'X', ...over }
  }
  it('excludes programmes with no deal_stage set', () => {
    const r = dealCards([prog({ deal_stage: null }), prog({ id: 'y', deal_stage: 'won', deal_value: 10 })])
    expect(r.map(d => d.id)).toEqual(['y'])
  })
  it('orders most-progressed first (won, then proposal, then earlier stages)', () => {
    const r = dealCards([
      prog({ id: 'a', deal_stage: 'conversation', deal_value: 60_000 }),
      prog({ id: 'b', deal_stage: 'proposal', deal_value: 96_000 }),
      prog({ id: 'c', deal_stage: 'won', deal_value: 112_000 }),
    ])
    expect(r.map(d => d.id)).toEqual(['c', 'b', 'a'])
  })
  it('ties within a stage break by value descending', () => {
    const r = dealCards([
      prog({ id: 'a', deal_stage: 'proposal', deal_value: 10 }),
      prog({ id: 'b', deal_stage: 'proposal', deal_value: 50 }),
    ])
    expect(r.map(d => d.id)).toEqual(['b', 'a'])
  })
  it('bar fractions are relative to the largest deal value in view', () => {
    const r = dealCards([
      prog({ id: 'a', deal_stage: 'won', deal_value: 112_000 }),
      prog({ id: 'b', deal_stage: 'proposal', deal_value: 56_000 }),
    ])
    expect(r.find(d => d.id === 'a')!.barFrac).toBe(1)
    expect(r.find(d => d.id === 'b')!.barFrac).toBeCloseTo(0.5)
  })
  it('subtitle falls back to funder/country, then programme type', () => {
    const r = dealCards([prog({ deal_stage: 'won', funder: 'AAI', country: 'Uganda' })])
    expect(r[0].subtitle).toBe('AAI · Uganda')
    const r2 = dealCards([prog({ deal_stage: 'won', type: 'donor_programme' })])
    expect(r2[0].subtitle).toBe('Donor programme')
  })
})
