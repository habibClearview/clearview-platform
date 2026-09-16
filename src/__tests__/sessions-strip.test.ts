// ============================================================
// WHEN A SESSION IS, AND WHICH ONE IS NEXT
//
// These two are the only parts of the sessions strip that can be reasoned
// about without a browser, and they are the parts that were wrong.
//
// A DATE WITH NO TIME IS A DAY, NOT MIDNIGHT IN GREENWICH. CodeRabbit on #276:
// new Date('2026-09-17') is parsed as UTC midnight, so anybody west of
// Greenwich reads it as the day before. A session planned for Thursday showed
// as Wednesday all day in every American timezone. And "next" required a full
// timestamp, so a session somebody put in the diary as a date was left out
// altogether and the strip read as though nothing were planned.
//
// These run the real functions rather than reading the file, so they fail on
// behaviour rather than on wording.
// ============================================================
import { describe, it, expect } from 'vitest'
import { whenText, nextSession } from '@/lib/session-time'

const planned = (over = {}) => ({ id: 'x', status: 'planned', ...over })

describe('whenText', () => {
  it('reads a timed session as a day and a time', () => {
    const text = whenText(planned({ planned_at: '2026-09-17T09:30:00.000Z' }))
    expect(text).toMatch(/Sep/)
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  it('reads a date-only session as that calendar day, wherever the reader is', () => {
    // The whole point: the 17th says the 17th, not the 16th.
    const text = whenText(planned({ planned_date: '2026-09-17' }))
    expect(text).toContain('17')
    expect(text).toContain('Sep')
    // And no invented time, because none was given.
    expect(text).not.toMatch(/\d{2}:\d{2}/)
  })

  it('says so plainly when there is no date at all', () => {
    expect(whenText(planned())).toBe('No time set')
    expect(whenText(null)).toBe('No time set')
  })

  it('treats a date it cannot read as no date, rather than as today', () => {
    expect(whenText(planned({ planned_date: 'soon' }))).toBe('No time set')
    expect(whenText(planned({ planned_at: 'not a date' }))).toBe('No time set')
  })

  it('prefers the exact moment when a session has both', () => {
    const text = whenText(planned({ planned_at: '2026-09-17T09:30:00.000Z', planned_date: '2026-09-11' }))
    expect(text).toMatch(/\d{2}:\d{2}/)
  })
})

describe('nextSession', () => {
  const now = new Date('2026-09-16T12:00:00.000Z')

  it('is the soonest one still to come', () => {
    const later = planned({ id: 'later', planned_at: '2026-09-20T09:00:00.000Z' })
    const sooner = planned({ id: 'sooner', planned_at: '2026-09-17T09:00:00.000Z' })
    expect(nextSession([later, sooner], now)?.id).toBe('sooner')
  })

  it('leaves behind what has already happened', () => {
    const past = planned({ id: 'past', planned_at: '2026-09-01T09:00:00.000Z' })
    expect(nextSession([past], now)).toBeNull()
  })

  it('counts a session that has only a day, which it used to ignore', () => {
    const byDay = planned({ id: 'byday', planned_date: '2026-09-18' })
    expect(nextSession([byDay], now)?.id).toBe('byday')
  })

  it('does not call a day missed until that day is over', () => {
    // A session at some point on Wednesday has not been missed at noon on
    // Wednesday.
    //
    // BUILT FROM LOCAL PARTS, NOT FROM A Z STAMP. CodeRabbit on #278: the
    // "day is over" moment was written as 2026-09-17T08:00:00Z, which is still
    // the local 16th anywhere west of -08:00, so in Honolulu this test failed
    // and in London it passed. A test that answers to the runner's clock is
    // not a test.
    const today = planned({ id: 'today', planned_date: '2026-09-16' })
    expect(nextSession([today], new Date(2026, 8, 16, 12, 0))).toBe(today)
    const nextMorning = new Date(2026, 8, 17, 8, 0)
    expect(nextSession([today], nextMorning)).toBeNull()
  })

  it('ignores a session that was held or cancelled, whatever its date says', () => {
    const held = { id: 'held', status: 'held', planned_at: '2026-09-20T09:00:00.000Z' }
    const cancelled = { id: 'cancelled', status: 'cancelled', planned_at: '2026-09-19T09:00:00.000Z' }
    expect(nextSession([held, cancelled], now)).toBeNull()
  })

  it('ignores a session with no date, rather than putting it first', () => {
    const undated = planned({ id: 'undated' })
    const dated = planned({ id: 'dated', planned_at: '2026-09-20T09:00:00.000Z' })
    expect(nextSession([undated, dated], now)?.id).toBe('dated')
  })

  it('is null on an empty list and on nothing at all', () => {
    expect(nextSession([], now)).toBeNull()
    expect(nextSession(null, now)).toBeNull()
  })
})
