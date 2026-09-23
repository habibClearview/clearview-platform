// ============================================================
// The monthly record, and the rules that decide what may be published from it.
//
// 23 September 2026. Every rule here decides what a funder reads and what a
// programme director quotes, so each one is pinned down rather than trusted.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  matches, monthsIn, monthLabel, median, total, groupByMonth, readCount,
  buildSeries, verifiedShare, atMarketReadyOrAbove, aboveLenderComfort,
  slippedBackByMonth, stageCounts, movement, reading,
  MIN_FOR_PUBLICATION, STAGE_ORDER, type SnapshotRow,
} from '@/lib/portfolio-history'

const row = (over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  client_id: 'c1', ref_code: 'BIZ-AAAAA', snapshot_month: '2026-03-01',
  sector: 'Grain', country: 'Uganda', programme_id: 'p1',
  readiness_stage: 'development_stage', ir_score: 15,
  declared_revenue: 1000, verified_revenue: 400, dscr_min: 1.8,
  ...over,
})

/** n rows in one month, each a different engagement. */
const cohort = (n: number, month: string, over: Partial<SnapshotRow> = {}) =>
  Array.from({ length: n }, (_, i) =>
    row({ client_id: 'c' + i, ref_code: 'BIZ-' + i, snapshot_month: month, ...over }))

describe('which rows belong in a view', () => {
  it('keeps everything when nothing is filtered', () => {
    expect(matches(row(), {})).toBe(true)
  })

  it.each([
    ['programme', { programmeId: 'p2' }],
    ['sector', { sector: 'Dairy' }],
    ['country', { country: 'Kenya' }],
    ['readiness stage', { readinessStage: 'investment_ready' }],
  ])('excludes a row that does not match on %s', (_n, filter) => {
    expect(matches(row(), filter)).toBe(false)
  })

  it('requires every named filter to match, not just one', () => {
    expect(matches(row(), { sector: 'Grain', country: 'Kenya' })).toBe(false)
    expect(matches(row(), { sector: 'Grain', country: 'Uganda' })).toBe(true)
  })

  it('applies a readiness filter to each month separately, not to where they are now', () => {
    const rows = [
      row({ snapshot_month: '2026-01-01', readiness_stage: 'development_stage' }),
      row({ snapshot_month: '2026-02-01', readiness_stage: 'near_ready' }),
    ]
    const kept = rows.filter((r) => matches(r, { readinessStage: 'near_ready' }))
    expect(kept).toHaveLength(1)
    expect(kept[0].snapshot_month).toBe('2026-02-01')
  })
})

describe('reading the months', () => {
  it('lists them oldest first with no repeats', () => {
    expect(monthsIn([
      row({ snapshot_month: '2026-03-01' }),
      row({ snapshot_month: '2026-01-01' }),
      row({ snapshot_month: '2026-03-01' }),
    ])).toEqual(['2026-01', '2026-03'])
  })

  it('ignores a row with no readable month rather than inventing one', () => {
    expect(monthsIn([row({ snapshot_month: '' as any })])).toEqual([])
  })

  it('labels a month the way a person writes it', () => {
    expect(monthLabel('2026-03')).toBe('Mar 26')
    expect(monthLabel('2025-12')).toBe('Dec 25')
  })

  it('hands back anything it cannot read rather than showing nonsense', () => {
    expect(monthLabel('rubbish')).toBe('rubbish')
    expect(monthLabel('2026-19')).toBe('2026-19')
  })
})

describe('the middle value, never the average', () => {
  it('takes the middle of an odd list', () => {
    expect(median([1, 100, 3])).toBe(3)
  })

  it('takes the midpoint of an even list', () => {
    expect(median([2, 4, 6, 8])).toBe(5)
  })

  it('cannot be moved by one very large member, which an average can', () => {
    const ordinary = [10, 12, 11, 13, 12]
    const withGiant = [10, 12, 11, 13, 12, 100000]
    expect(median(ordinary)).toBe(12)
    expect(median(withGiant)).toBe(12)
  })

  it('ignores gaps rather than counting them as zero', () => {
    expect(median([10, null, 20, undefined])).toBe(15)
  })

  it('answers nothing when there is nothing', () => {
    expect(median([])).toBeNull()
    expect(median([null, undefined])).toBeNull()
    expect(total([null])).toBeNull()
  })

  it('accepts a real zero as a real figure', () => {
    expect(median([0, 0, 0])).toBe(0)
    expect(total([0, 0])).toBe(0)
  })
})

describe('a month that read nothing', () => {
  it('does not count an engagement whose reading failed', () => {
    const rows = [row(), row({ client_id: 'c2', skipped_reason: 'the model could not be read' })]
    expect(readCount(rows)).toBe(1)
  })

  it('answers null rather than zero when every reading failed', () => {
    const rows = cohort(6, '2026-03-01', { skipped_reason: 'no model' })
    const grouped = groupByMonth(rows)
    const s = buildSeries(grouped, ['2026-03'], (r) => r.length)
    expect(s[0].value).toBeNull()
    expect(s[0].n).toBe(0)
  })

  it('leaves a month with no rows at all as a gap', () => {
    const s = buildSeries({}, ['2026-03'], () => 5)
    expect(s[0].value).toBeNull()
    expect(s[0].n).toBe(0)
    expect(s[0].withheld).toBeUndefined()
  })
})

describe('refusing to publish from too few', () => {
  it('withholds a figure drawn from fewer than the minimum', () => {
    const grouped = groupByMonth(cohort(MIN_FOR_PUBLICATION - 1, '2026-03-01'))
    const s = buildSeries(grouped, ['2026-03'], () => 42)
    expect(s[0].value).toBeNull()
    expect(s[0].withheld).toBe(true)
    expect(s[0].n).toBe(MIN_FOR_PUBLICATION - 1)
  })

  it('publishes at exactly the minimum', () => {
    const grouped = groupByMonth(cohort(MIN_FOR_PUBLICATION, '2026-03-01'))
    const s = buildSeries(grouped, ['2026-03'], () => 42)
    expect(s[0].value).toBe(42)
    expect(s[0].withheld).toBeUndefined()
  })

  it('says how many stood behind a withheld month, so the gap can be explained', () => {
    const grouped = groupByMonth(cohort(3, '2026-03-01'))
    const s = buildSeries(grouped, ['2026-03'], () => 42)
    expect(s[0].n).toBe(3)
  })

  it('still counts the population itself, which identifies nobody', () => {
    const grouped = groupByMonth(cohort(3, '2026-03-01'))
    const s = buildSeries(grouped, ['2026-03'], (r) => r.length, false)
    expect(s[0].value).toBe(3)
  })
})

describe('verified share of declared revenue', () => {
  it('is a share of the totals, not an average of each share', () => {
    const rows = [
      row({ declared_revenue: 1000, verified_revenue: 900 }),
      row({ client_id: 'c2', declared_revenue: 9000, verified_revenue: 900 }),
    ]
    // Averaging each share would give 50%. The money says 18%.
    expect(verifiedShare(rows)).toBeCloseTo(18, 5)
  })

  it('never counts money that arrived but was matched to no sale', () => {
    const rows = [row({ declared_revenue: 1000, verified_revenue: 400, unattributed_revenue: 500 })]
    expect(verifiedShare(rows)).toBe(40)
  })

  it('answers nothing when nothing was declared, rather than dividing by zero', () => {
    expect(verifiedShare([row({ declared_revenue: 0, verified_revenue: 0 })])).toBeNull()
    expect(verifiedShare([])).toBeNull()
  })

  it('reports nil verification as zero, which is a real answer', () => {
    expect(verifiedShare([row({ declared_revenue: 1000, verified_revenue: 0 })])).toBe(0)
  })
})

describe('counting engagements by where they stand', () => {
  it('counts market ready and commercially viable together', () => {
    const rows = [
      row({ readiness_stage: 'near_ready' }),
      row({ client_id: 'c2', readiness_stage: 'investment_ready' }),
      row({ client_id: 'c3', readiness_stage: 'development_stage' }),
    ]
    expect(atMarketReadyOrAbove(rows)).toBe(2)
  })

  it('counts those at or above the level lenders look for', () => {
    const rows = [
      row({ dscr_min: 1.5 }), row({ client_id: 'c2', dscr_min: 2.4 }),
      row({ client_id: 'c3', dscr_min: 1.2 }), row({ client_id: 'c4', dscr_min: null }),
    ]
    expect(aboveLenderComfort(rows)).toBe(2)
  })

  it('gives every stage a line, including one nobody is at', () => {
    const grouped = groupByMonth(cohort(6, '2026-03-01', { readiness_stage: 'development_stage' }))
    const counts = stageCounts(grouped, ['2026-03'])
    expect(counts.development_stage[0].value).toBe(6)
    expect(counts.investment_ready[0].value).toBe(0)
    expect(Object.keys(counts)).toHaveLength(STAGE_ORDER.length)
  })
})

describe('who has slipped back', () => {
  const months = ['2026-01', '2026-02', '2026-03']

  it('counts an engagement that is below the best it reached', () => {
    const rows = [
      row({ snapshot_month: '2026-01-01', readiness_stage: 'development_stage' }),
      row({ snapshot_month: '2026-02-01', readiness_stage: 'near_ready' }),
      row({ snapshot_month: '2026-03-01', readiness_stage: 'development_stage' }),
    ]
    const s = slippedBackByMonth(rows, months)
    expect(s.map((p) => p.value)).toEqual([0, 0, 1])
  })

  it('stops counting one that climbs back', () => {
    const rows = [
      row({ snapshot_month: '2026-01-01', readiness_stage: 'near_ready' }),
      row({ snapshot_month: '2026-02-01', readiness_stage: 'development_stage' }),
      row({ snapshot_month: '2026-03-01', readiness_stage: 'near_ready' }),
    ]
    expect(slippedBackByMonth(rows, months).map((p) => p.value)).toEqual([0, 1, 0])
  })

  it('never counts one that has only ever climbed', () => {
    const rows = [
      row({ snapshot_month: '2026-01-01', readiness_stage: 'pre_investment' }),
      row({ snapshot_month: '2026-02-01', readiness_stage: 'development_stage' }),
      row({ snapshot_month: '2026-03-01', readiness_stage: 'investment_ready' }),
    ]
    expect(slippedBackByMonth(rows, months).map((p) => p.value)).toEqual([0, 0, 0])
  })

  it('judges each engagement against its own best, not against the others', () => {
    const rows = [
      row({ client_id: 'a', snapshot_month: '2026-01-01', readiness_stage: 'investment_ready' }),
      row({ client_id: 'a', snapshot_month: '2026-02-01', readiness_stage: 'near_ready' }),
      row({ client_id: 'b', snapshot_month: '2026-01-01', readiness_stage: 'pre_investment' }),
      row({ client_id: 'b', snapshot_month: '2026-02-01', readiness_stage: 'pre_investment' }),
    ]
    expect(slippedBackByMonth(rows, ['2026-01', '2026-02']).map((p) => p.value)).toEqual([0, 1])
  })

  it('leaves a month with no readings as a gap rather than zero', () => {
    const rows = [row({ snapshot_month: '2026-01-01' })]
    expect(slippedBackByMonth(rows, ['2026-01', '2026-02'])[1].value).toBeNull()
  })

  it('ignores a month whose reading failed', () => {
    const rows = [
      row({ snapshot_month: '2026-01-01', readiness_stage: 'near_ready' }),
      row({ snapshot_month: '2026-02-01', readiness_stage: null, skipped_reason: 'no model' }),
    ]
    expect(slippedBackByMonth(rows, ['2026-01', '2026-02'])[1].value).toBeNull()
  })
})

describe('the change across a series', () => {
  const pt = (label: string, value: number | null) => ({ month: label, label, value, n: 9 })

  it('measures first published reading to last', () => {
    const m = movement([pt('a', 20), pt('b', 25), pt('c', 30)])
    expect(m.from).toBe(20)
    expect(m.to).toBe(30)
    expect(m.diff).toBe(10)
    expect(m.pct).toBe(50)
    expect(m.months).toBe(2)
  })

  it('steps over gaps at either end instead of measuring against nothing', () => {
    const m = movement([pt('a', null), pt('b', 20), pt('c', 30), pt('d', null)])
    expect(m.from).toBe(20)
    expect(m.to).toBe(30)
    expect(m.months).toBe(1)
  })

  it('refuses to claim a change from one reading', () => {
    const m = movement([pt('a', null), pt('b', 42)])
    expect(m.diff).toBeNull()
    expect(m.to).toBe(42)
  })

  it('answers nothing at all for an empty record', () => {
    expect(movement([]).to).toBeNull()
  })

  it('does not divide by a starting figure of zero', () => {
    expect(movement([pt('a', 0), pt('b', 5)]).pct).toBeNull()
  })
})

describe('whether a movement is good news', () => {
  const m = (from: number, to: number) => ({ from, to, diff: to - from, pct: 0, months: 1 })

  it('reads a rise as good where rising is good', () => {
    expect(reading(m(20, 30), 'up')).toBe('up')
  })

  it('reads a fall as good where falling is good', () => {
    expect(reading(m(60, 44), 'down')).toBe('up')
  })

  it('reads a rise as bad where falling is good', () => {
    expect(reading(m(44, 60), 'down')).toBe('down')
  })

  it('calls a small move holding rather than a trend', () => {
    expect(reading(m(100, 102), 'up')).toBe('flat')
  })

  it('says it does not know rather than guessing, when there is one reading', () => {
    expect(reading({ from: null, to: 5, diff: null, pct: null, months: 0 }, 'up')).toBe('unknown')
  })
})
