import { describe, it, expect } from 'vitest'
import {
  engagementSplit, independentClients, feesReceivedInYear, outstandingInvoiced,
  averageDaysToCollect, revenueStreams, dealCards, dealWinRate,
  canvasProgress, coImplementerNamesForClient, engagementDisplayStatus, coImplementerWorkload,
  type FeeClient, type DealProgramme,
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
  it('counts the real number of contributing clients per stream', () => {
    const clients = [
      client({ id: 'a', programme_id: 'donor1', engagement_fee: 60_000, engagement_mode: 'canvas' }),
      client({ id: 'b', programme_id: 'donor1', engagement_fee: 52_000, engagement_mode: 'canvas' }),
      client({ id: 'c', programme_id: null, engagement_mode: 'financial', engagement_fee: 36_000 }),
    ]
    const r = revenueStreams(clients, programmesById)
    const byKey = Object.fromEntries(r.streams.map(s => [s.key, s.clientCount]))
    expect(byKey.programme_advisory).toBe(2)
    expect(byKey.clearview_subscriptions).toBe(1)
    expect(byKey.self_funded_gtcv).toBe(0)
    expect(r.streams.find(s => s.key === 'programme_advisory')!.description).toBe('GtCV paid by programmes · 2 clients')
    expect(r.streams.find(s => s.key === 'clearview_subscriptions')!.description).toBe('Independent · recurring · 1 client')
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

describe('dealWinRate', () => {
  it('computes won / total-with-stage', () => {
    const r = dealWinRate([
      { id: 'a', name: 'A', deal_stage: 'won' },
      { id: 'b', name: 'B', deal_stage: 'proposal' },
      { id: 'c', name: 'C', deal_stage: 'conversation' },
      { id: 'd', name: 'D', deal_stage: null },
    ])
    expect(r.wonCount).toBe(1)
    expect(r.totalCount).toBe(3)
    expect(r.pct).toBeCloseTo(1 / 3)
  })
  it('is 0/0 with no deals in the pipeline (not NaN)', () => {
    const r = dealWinRate([])
    expect(r).toEqual({ wonCount: 0, totalCount: 0, pct: 0 })
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
  it('bar fraction uses the coach-entered deal_probability when set', () => {
    const r = dealCards([prog({ deal_stage: 'proposal', deal_probability: 70 })])
    expect(r[0].barFrac).toBeCloseTo(0.7)
  })
  it('falls back to a fixed per-stage default when no probability is set -- never derived from dollar value', () => {
    const r = dealCards([
      prog({ id: 'a', deal_stage: 'won', deal_value: 112_000 }),
      prog({ id: 'b', deal_stage: 'proposal', deal_value: 56_000 }),
    ])
    expect(r.find(d => d.id === 'a')!.barFrac).toBe(1)
    expect(r.find(d => d.id === 'b')!.barFrac).toBeCloseTo(0.65)
  })
  it('clamps an out-of-range probability into 0..1', () => {
    const r = dealCards([prog({ deal_stage: 'won', deal_probability: 150 })])
    expect(r[0].barFrac).toBe(1)
  })
  it('subtitle falls back to funder/country, then programme type', () => {
    const r = dealCards([prog({ deal_stage: 'won', funder: 'AAI', country: 'Uganda' })])
    expect(r[0].subtitle).toBe('AAI · Uganda')
    const r2 = dealCards([prog({ deal_stage: 'won', type: 'donor_programme' })])
    expect(r2[0].subtitle).toBe('Donor programme')
  })
})

describe('canvasProgress', () => {
  it('a client with no canvas rows at all is 0/0, never a fabricated 9', () => {
    const r = canvasProgress([])
    expect(r).toEqual({ doneCount: 0, totalCount: 0, currentLabel: 'Not started' })
  })
  it('counts only real rows present, in the real stage order', () => {
    const r = canvasProgress([
      { dp_id: 'phase_0', status: '✓' }, { dp_id: 'dp01', status: '✓' },
      { dp_id: 'dp02', status: '✓' }, { dp_id: 'dp03', status: '◐' },
    ])
    expect(r.doneCount).toBe(3)
    expect(r.totalCount).toBe(4)
    expect(r.currentLabel).toBe('DP03 · value proposition')
  })
  it('reports Complete when every present stage is done', () => {
    const r = canvasProgress([{ dp_id: 'phase_0', status: '✓' }, { dp_id: 'dp01', status: '✓' }])
    expect(r.currentLabel).toBe('Complete')
  })
  it('is unaffected by row order in the input', () => {
    const a = canvasProgress([{ dp_id: 'dp02', status: '○' }, { dp_id: 'dp01', status: '✓' }])
    const b = canvasProgress([{ dp_id: 'dp01', status: '✓' }, { dp_id: 'dp02', status: '○' }])
    expect(a).toEqual(b)
  })
})

describe('coImplementerNamesForClient', () => {
  it('finds every co-implementer whose client_ids includes this client', () => {
    const r = coImplementerNamesForClient('c1', [
      { id: 'ci1', name: 'Joy N.', client_ids: ['c1', 'c2'] },
      { id: 'ci2', name: 'David O.', client_ids: ['c2'] },
      { id: 'ci3', name: 'Sarah B.', client_ids: ['c1'] },
    ])
    expect(r.sort()).toEqual(['Joy N.', 'Sarah B.'])
  })
  it('returns an empty array, not undefined, when nobody is assigned', () => {
    expect(coImplementerNamesForClient('c9', [{ id: 'ci1', name: 'X', client_ids: null }])).toEqual([])
  })
})

describe('engagementDisplayStatus', () => {
  it('a complete engagement always shows Closed, regardless of fee_status', () => {
    expect(engagementDisplayStatus({ status: 'complete', fee_status: 'unpaid' })).toEqual({ label: 'Closed', key: 'closed' })
  })
  it('falls back to fee_status when not complete', () => {
    expect(engagementDisplayStatus({ status: 'dp03', fee_status: 'paid' })).toEqual({ label: 'Paid up', key: 'paid' })
    expect(engagementDisplayStatus({ status: 'dp03', fee_status: 'invoiced' })).toEqual({ label: 'Invoiced', key: 'invoiced' })
  })
  it('never invents a status when neither field is informative', () => {
    expect(engagementDisplayStatus({})).toEqual({ label: 'Not set', key: 'unset' })
  })
})

describe('coImplementerWorkload', () => {
  const entries = [
    { co_implementer_id: 'ci1', hours: 6, status: 'submitted', entry_date: '2026-07-05' },
    { co_implementer_id: 'ci1', hours: 8, status: 'approved', entry_date: '2026-07-10' },
    { co_implementer_id: 'ci1', hours: 4, status: 'approved', entry_date: '2026-06-01' },
    { co_implementer_id: 'ci2', hours: 3, status: 'approved', entry_date: '2026-07-01' },
  ]
  const now = new Date('2026-07-15T00:00:00Z')
  it('sums pending and approved hours per co-implementer', () => {
    const r = coImplementerWorkload('ci1', entries, now)
    expect(r.pendingHours).toBe(6)
    expect(r.approvedHours).toBe(12)
  })
  it('counts only sessions in the current calendar month', () => {
    const r = coImplementerWorkload('ci1', entries, now)
    expect(r.sessionsThisMonth).toBe(2)
  })
  it('a co-implementer with no entries gets all zeros, not undefined/NaN', () => {
    const r = coImplementerWorkload('ci9', entries, now)
    expect(r).toEqual({ pendingHours: 0, approvedHours: 0, sessionsThisMonth: 0 })
  })
})
