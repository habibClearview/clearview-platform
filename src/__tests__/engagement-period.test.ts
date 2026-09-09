// ============================================================
// ONE ANSWER TO "WHEN DOES THIS ENGAGEMENT RUN"
//
// Habib: there are repetitions of data, presentation of the same information
// that we do not need to have in multiple places.
//
// The period was stored twice. The client record held start_date and
// expected_close, typed when the client was created. The brief held
// periodStart and periodEnd, read out of the signed purchase order. On Ikore
// they disagreed, and no screen said so, so the Cover and the welcome letter
// could tell a funder two different closing dates.
//
// Which is right is not something code can decide, so it is shown and settled
// by the person who knows. What code can guarantee is that there is only ever
// one answer being read.
// ============================================================
import { describe, it, expect } from 'vitest'
import { periodDisagreement, engagementPeriod } from '@/lib/engagement-brief'

const brief = { periodStart: '2026-09-07', periodEnd: '2027-03-15' }

describe('when the record and the document disagree', () => {
  it('names both dates rather than quietly preferring one', () => {
    const found = periodDisagreement({ start_date: '2026-09-21', expected_close: '2027-03-22' }, brief)
    expect(found).toHaveLength(2)
    expect(found[0]).toEqual({ field: 'start', recorded: '2026-09-21', document: '2026-09-07' })
    expect(found[1]).toEqual({ field: 'end', recorded: '2027-03-22', document: '2027-03-15' })
  })

  it('says nothing when they agree', () => {
    expect(periodDisagreement({ start_date: '2026-09-07', expected_close: '2027-03-15' }, brief)).toEqual([])
  })

  it('ignores a timestamp against a date, which is the same day', () => {
    expect(periodDisagreement({ start_date: '2026-09-07T00:00:00Z', expected_close: '2027-03-15' }, brief)).toEqual([])
  })

  it('is silent where one side has no answer, because that is a gap not a clash', () => {
    expect(periodDisagreement({ start_date: null, expected_close: null }, brief)).toEqual([])
    expect(periodDisagreement({ start_date: '2026-09-21' }, {})).toEqual([])
    expect(periodDisagreement({ start_date: '2026-09-21' }, null)).toEqual([])
  })

  it('reports only the half that differs', () => {
    const found = periodDisagreement({ start_date: '2026-09-07', expected_close: '2027-03-22' }, brief)
    expect(found).toHaveLength(1)
    expect(found[0].field).toBe('end')
  })
})

describe('the one period everything reads', () => {
  it('is the client record, because that is the one a person can change', () => {
    const p = engagementPeriod({ start_date: '2026-09-21', expected_close: '2027-03-22' }, brief)
    expect(p).toEqual({ periodStart: '2026-09-21', periodEnd: '2027-03-22' })
  })

  it('falls back to the document where the record has no answer', () => {
    // A client created without dates still gets its period out of the purchase
    // order, which is better than a letter that says nothing about when.
    expect(engagementPeriod({}, brief)).toEqual({ periodStart: '2026-09-07', periodEnd: '2027-03-15' })
  })

  it('fills only the half that is missing', () => {
    expect(engagementPeriod({ start_date: '2026-09-21' }, brief))
      .toEqual({ periodStart: '2026-09-21', periodEnd: '2027-03-15' })
  })

  it('is empty when nobody has said, rather than inventing a period', () => {
    expect(engagementPeriod({}, null)).toEqual({ periodStart: undefined, periodEnd: undefined })
  })
})

describe('where the one answer is actually used', () => {
  const fs = require('fs')
  const COVER = fs.readFileSync('src/components/gtcv/CoverPanel.tsx', 'utf8')
  const EMAIL = fs.readFileSync('app/api/engagement-email/route.ts', 'utf8')

  it('the letters read the record, so a letter cannot quote a different close', () => {
    expect(EMAIL).toContain('engagementPeriod(client, stored)')
    expect(EMAIL).toContain("select('name, programme_id, engagement_mode, start_date, expected_close')")
  })

  it('the Cover says when the record and the document disagree', () => {
    expect(COVER).toContain('periodDisagreement(client, brief)')
    expect(COVER).toContain('These dates do not match the signed document')
  })

  it('names the document rather than saying "the brief"', () => {
    // "Purchase Order 149" is a thing Habib can go and look at.
    expect(COVER).toContain("brief?.reference || 'the signed document'")
  })

  it('settles it in one press, and only for somebody who may change it', () => {
    expect(COVER).toContain('Use the dates on ')
    expect(COVER).toContain('{canManage && (')
  })
})
