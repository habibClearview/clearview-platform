// ============================================================
// THE PUBLIC SCORE AND THE COACH'S SCORE ARE THE SAME SCORE.
//
// A visitor scores four on the website and then hears a different number in
// the first session: that is the failure this guards against, and it would
// happen the moment somebody edits one list and not the other.
//
// It also pins the thing that is easy to get wrong in a public form — that a
// question left blank has to count as a no. If a skipped question counted as
// nothing, a visitor could answer one question yes and score one out of one.
// ============================================================
import { describe, expect, it } from 'vitest'
import { scoreReadiness, bandTag, READINESS } from '@/lib/readiness-score'
import { READINESS_QUESTIONS } from '@/lib/coach-types'

const all = (v: boolean) => Object.fromEntries(READINESS.map((q) => [q.id, v]))
const yes = (n: number) =>
  Object.fromEntries(READINESS.map((q, i) => [q.id, i < n]))

describe('the ten questions', () => {
  it('are the engagement\'s own ten, by identity', () => {
    // The public site says these in plainer words than the coach uses in a
    // room, which is deliberate. What must never drift is WHICH ten they are,
    // because a visitor who scores four here hears the same number in the
    // first session.
    expect(READINESS).toHaveLength(READINESS_QUESTIONS.length)
    expect(READINESS.map((q) => q.id)).toEqual(READINESS_QUESTIONS.map((q) => q.id))
  })

  it('says each one in fewer, plainer words than the coach\'s version', () => {
    // Not a style preference: the reader is at their desk, not in a session.
    for (const q of READINESS) {
      expect(q.question.length).toBeLessThan(110)
      expect(q.question).not.toMatch(/utilis|leverage|stakeholder/i)
    }
  })

  it('each say where in the method they are settled, and what a no costs', () => {
    for (const q of READINESS) {
      expect(q.settledAt, `${q.id} has no decision point`).toBeTruthy()
      expect(q.settledAt).not.toBe('The engagement')
      expect(q.ifNot.length, `${q.id} does not say what a no costs`).toBeGreaterThan(40)
    }
  })
})

describe('the bands match the coach\'s screen', () => {
  // The coach's screen: under 6 below threshold, 8 or more strong, else moderate.
  it('puts five and under below the threshold', () => {
    for (const n of [0, 1, 5]) expect(scoreReadiness(yes(n)).band).toBe('below')
  })
  it('puts six and seven at moderate', () => {
    expect(scoreReadiness(yes(6)).band).toBe('moderate')
    expect(scoreReadiness(yes(7)).band).toBe('moderate')
  })
  it('puts eight and over at strong', () => {
    for (const n of [8, 9, 10]) expect(scoreReadiness(yes(n)).band).toBe('strong')
  })
  it('labels the bands in the same words the coach uses', () => {
    expect(scoreReadiness(yes(3)).bandLabel).toBe('Below threshold')
    expect(scoreReadiness(yes(6)).bandLabel).toBe('Moderate readiness')
    expect(scoreReadiness(yes(9)).bandLabel).toBe('Strong readiness')
  })
})

describe('scoring', () => {
  it('counts only explicit yeses', () => {
    expect(scoreReadiness(all(true)).score).toBe(10)
    expect(scoreReadiness(all(false)).score).toBe(0)
  })

  it('treats a question left blank as a no, not as absent', () => {
    // One yes and nine never touched is one out of ten, not one out of one.
    const r = scoreReadiness({ rq1: true })
    expect(r.score).toBe(1)
    expect(r.total).toBe(10)
    expect(r.gaps).toHaveLength(9)
  })

  it('never trusts a string, a number or a lie posted as an answer', () => {
    const r = scoreReadiness({ rq1: 'true', rq2: 1, rq3: 'yes', rq4: {}, score: 10 } as any)
    expect(r.score).toBe(0)
  })

  it('reports every no as a gap, with where it is settled', () => {
    const r = scoreReadiness(yes(8))
    expect(r.gaps).toHaveLength(2)
    for (const g of r.gaps) expect(g.settledAt).toBeTruthy()
  })

  it('says something different at each band', () => {
    const a = scoreReadiness(yes(2)), b = scoreReadiness(yes(6)), c = scoreReadiness(yes(10))
    const said = [a.meaning, b.meaning, c.meaning]
    expect(new Set(said).size).toBe(3)
    expect(new Set([a.nextStep, b.nextStep, c.nextStep]).size).toBe(3)
  })

  it('tags the subscriber by band so the list can be segmented', () => {
    expect(bandTag('below')).toBe('readiness-below')
    expect(bandTag('strong')).toBe('readiness-strong')
  })
})
