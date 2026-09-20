// ============================================================
// THE MONTHLY PHOTOGRAPH HAS TO BE RIGHT THE FIRST TIME.
//
// A reading taken wrongly in September cannot be retaken in October. There is
// no second chance at the past, which is the whole reason this exists, so the
// rules that decide what goes into a reading are tested directly rather than
// through the route that files them.
//
// Two of these tests are about the promises made on 20 September: that a
// photograph never holds a name, and that a month that could not be read says
// so rather than going quietly missing.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  monthKey, previousMonth, stillToTake, financialRow, coachingRow, skippedRow, stripNames,
} from '@/lib/monthly-snapshot'
import { anonymizedRefCode } from '@/lib/portfolio-intelligence'

const SNAPSHOT: any = {
  clientId: 'ikore',
  name: 'Ikore International Development Limited',
  sector: 'Agriculture',
  country: 'Nigeria',
  programmeId: 'ignite',
  irScore: 61,
  irTier: 'Near Ready',
  lrs: { dimensions: {} },
  confidenceScore: 72,
  confidenceBadges: ['consistent', 'verified'],
  fac: { amount: 40_000, band: 'Moderate' },
  currency: 'NGN',
  annualRevenue: 120_000,
  businessUnits: [
    { id: 'shop_1', name: 'Lagos depot', sharePct: 60, revenue: 72_000 },
    { id: 'shop_2', name: 'Kano depot', sharePct: 40, revenue: 48_000 },
  ],
  consentToBeNamed: true,
  performance: {
    revenueGrowthPct: 18, costRatioPct: 72, grossMarginPct: 41, ebitdaMarginPct: 12,
    netMarginPct: 7, dscrMin: 1.4, ruleOf40: 30, burnMultiple: null, roiPct: 9,
  },
}

describe('which month a reading belongs to', () => {
  it('is always the first day of that month', () => {
    expect(monthKey(new Date('2026-09-20T23:30:00Z'))).toBe('2026-09-01')
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01')
    expect(monthKey('2026-12-31')).toBe('2026-12-01')
  })

  it('knows the month before, including across a year', () => {
    expect(previousMonth('2026-09-01')).toBe('2026-08-01')
    expect(previousMonth('2026-01-01')).toBe('2025-12-01')
  })

  it('refuses a date that is not a date, rather than filing under nothing', () => {
    expect(() => monthKey('not a date')).toThrow()
  })
})

describe('running every day, writing once a month', () => {
  it('takes a reading only for engagements that have none this month', () => {
    expect(stillToTake(['a', 'b', 'c'], [{ client_id: 'b' }])).toEqual(['a', 'c'])
  })

  it('does nothing at all once every engagement has been read', () => {
    expect(stillToTake(['a', 'b'], [{ client_id: 'a' }, { client_id: 'b' }])).toEqual([])
  })

  it('treats a skipped month as read, so the same failure is not rewritten daily', () => {
    // The skipped row is a row, so it appears in what has already been taken.
    const skipped = skippedRow('a', '2026-09-01', 'no model')
    expect(stillToTake(['a', 'b'], [{ client_id: skipped.client_id }])).toEqual(['b'])
  })
})

describe('a photograph never holds a name', () => {
  it('leaves the organisation name out of the row entirely', () => {
    const row = financialRow(SNAPSHOT, '2026-09-01')
    const asText = JSON.stringify(row)
    expect(asText).not.toContain('Ikore')
    expect(asText).not.toContain('International Development')
  })

  it('leaves business unit names out too, while keeping what they earned', () => {
    const detail = stripNames(SNAPSHOT) as any
    expect(JSON.stringify(detail)).not.toContain('Lagos')
    expect(JSON.stringify(detail)).not.toContain('Kano')
    expect(detail.businessUnits).toHaveLength(2)
    expect(detail.businessUnits[0].sharePct).toBe(60)
    expect(detail.businessUnits[0].revenue).toBe(72_000)
  })

  it('carries a stable handle instead, so one organisation can be followed', () => {
    const september = financialRow(SNAPSHOT, '2026-09-01')
    const october = financialRow(SNAPSHOT, '2026-10-01')
    expect(september.ref_code).toBe(anonymizedRefCode('ikore'))
    expect(september.ref_code).toBe(october.ref_code)
    expect(september.ref_code).not.toContain('ikore')
  })
})

describe('what a financial reading keeps', () => {
  const row = financialRow(SNAPSHOT, '2026-09-01', {
    declaredRevenue: 100_000, verifiedRevenue: 64_000,
    coaching: { decisionPointsSigned: 3, decisionPointsTotal: 11, readinessCheckpointsTaken: 2 },
  })

  it('keeps where it stood and how it performed', () => {
    expect(row.ir_score).toBe(61)
    expect(row.ir_tier).toBe('Near Ready')
    expect(row.readiness_stage).toBeTruthy()
    expect(row.confidence_score).toBe(72)
    expect(row.gross_margin_pct).toBe(41)
    expect(row.dscr_min).toBe(1.4)
    expect(row.rule_of_40).toBe(30)
  })

  it('keeps declared and verified money side by side', () => {
    expect(row.declared_revenue).toBe(100_000)
    expect(row.verified_revenue).toBe(64_000)
  })

  it('keeps the coaching progress on the same row', () => {
    expect(row.decision_points_signed).toBe(3)
    expect(row.decision_points_total).toBe(11)
    expect(row.readiness_checkpoints_taken).toBe(2)
  })

  it('records what it does not know as nothing, never as nought', () => {
    // A burn multiple of null means cash generative. Filing it as 0 would read
    // as a business burning nothing per unit of new revenue, which is a
    // different and much better sounding claim than "does not apply".
    expect(row.burn_multiple).toBeNull()
    const noPerf = financialRow({ ...SNAPSHOT, performance: null }, '2026-09-01')
    expect(noPerf.gross_margin_pct).toBeNull()
    expect(noPerf.net_margin_pct).toBeNull()
  })
})

describe('a coaching engagement gets a reading too', () => {
  const row = coachingRow(
    { id: 'tanager-two', sector: 'Health', country: 'Kenya', programme_id: 'p1' },
    '2026-09-01',
    { decisionPointsSigned: 5, decisionPointsTotal: 11, readinessCheckpointsTaken: 2 },
  )

  it('records the progress and leaves the money columns empty', () => {
    expect(row.engagement_mode).toBe('canvas')
    expect(row.decision_points_signed).toBe(5)
    expect(row.annual_revenue).toBeNull()
    expect(row.ir_score).toBeNull()
  })

  it('still carries the grouping, so it can be counted by sector and country', () => {
    expect(row.sector).toBe('Health')
    expect(row.country).toBe('Kenya')
    expect(row.programme_id).toBe('p1')
  })
})

describe('a financial engagement is never filed as a coaching one', () => {
  // THE BUG THIS EXISTS TO STOP. 20 September 2026. The runner decided
  // between "skipped" and "coaching" by asking whether the whole-platform
  // load had thrown. That only happens when every client fails at once. One
  // client whose model cannot be built is dropped quietly by that loader
  // instead, so a real financial engagement would have been filed as a
  // coaching engagement, with no reason given, in a table that is never
  // corrected afterwards. The engagement's own mode has to decide it.
  //
  // The rule is tested here on the row builders because the decision is one
  // line in the runner; what matters is that the two rows are distinguishable
  // and that a financial engagement without a reading produces the skipped
  // one, carrying its mode and a reason.

  it('a skipped financial reading keeps its own mode and says why', () => {
    const row = skippedRow('ikore', '2026-09-01', 'the financial model could not be read this month', 'financial')
    expect(row.engagement_mode).toBe('financial')
    expect(row.skipped_reason).toBeTruthy()
  })

  it('a coaching row can never be mistaken for a failed financial one', () => {
    const coaching = coachingRow({ id: 'x' }, '2026-09-01', {
      decisionPointsSigned: 2, decisionPointsTotal: 11, readinessCheckpointsTaken: 1,
    })
    expect(coaching.engagement_mode).toBe('canvas')
    expect(coaching.skipped_reason).toBeNull()
    // The telling difference: a coaching row reports real progress, a skipped
    // row reports nothing at all, so a count of signed decision points can
    // never accidentally include a month that was never read.
    expect(coaching.decision_points_signed).toBe(2)
    expect(skippedRow('x', '2026-09-01', 'why', 'financial').decision_points_signed).toBeNull()
  })
})

describe('declared, verified and unattributed are three different things', () => {
  it('keeps them in three columns and never folds one into another', () => {
    // An earlier version called the sum of every provider transaction
    // "declared revenue". That is the payment side, not what the business
    // declared, and money that arrived with no sale to pair it to is neither.
    const row = financialRow(SNAPSHOT, '2026-09-01', {
      declaredRevenue: 120_000, verifiedRevenue: 64_000, unattributedRevenue: 9_000,
    })
    expect(row.declared_revenue).toBe(120_000)
    expect(row.verified_revenue).toBe(64_000)
    expect(row.unattributed_revenue).toBe(9_000)
  })

  it('records nothing rather than nought when there is no wallet linked', () => {
    const row = financialRow(SNAPSHOT, '2026-09-01', { declaredRevenue: 120_000 })
    expect(row.declared_revenue).toBe(120_000)
    expect(row.verified_revenue).toBeNull()
    expect(row.unattributed_revenue).toBeNull()
  })
})

describe('a month that could not be read says so', () => {
  it('files the reason rather than leaving a hole', () => {
    // A gap and a failure are different facts. A chart that cannot tell them
    // apart invites the wrong conclusion about the month in between.
    const row = skippedRow('ikore', '2026-09-01', 'the financial model would not load')
    expect(row.skipped_reason).toBe('the financial model would not load')
    expect(row.snapshot_month).toBe('2026-09-01')
    expect(row.ir_score).toBeNull()
    expect(row.decision_points_signed).toBeNull()
  })

  it('still holds no name', () => {
    const row = skippedRow('ikore', '2026-09-01', 'Ikore International could not be read')
    expect(row.client_id).toBe('ikore')
    expect(JSON.stringify({ ...row, skipped_reason: '' })).not.toContain('International')
  })

  it('keeps a long reason short enough to store', () => {
    const row = skippedRow('x', '2026-09-01', 'y'.repeat(1000))
    expect(row.skipped_reason!.length).toBeLessThanOrEqual(300)
  })
})
