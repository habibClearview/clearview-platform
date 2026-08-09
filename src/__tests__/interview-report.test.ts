// ============================================================
// The rules that decide whether a segment is evidenced.
//
// These tests exist mostly to hold one line: convergence does not move with
// the agreed minimum. It is the easiest rule in the method to lose, because
// both numbers are "how many conversations" and the natural instinct is to
// scale one with the other. Scaling it would mean an engagement could weaken
// its own evidence bar by agreeing to hold fewer conversations, which is
// exactly backwards.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  CONVERGENCE_MINIMUM,
  UNASSIGNED,
  buildInterviewReport,
  hasRealBudget,
} from '@/lib/interview-report'

const SEGMENTS = [
  { id: 's1', segment_name: 'Commercial farms' },
  { id: 's2', segment_name: 'Processors' },
]

/** A submitted capture, with the fields a test cares about overridden. */
function capture(over: Record<string, unknown> = {}) {
  return {
    status: 'submitted',
    segment: 'Commercial farms',
    budget_signal_strength: 'strong',
    assumption_confirmed: true,
    ...over,
  }
}

const seg = (report: ReturnType<typeof buildInterviewReport>, id: string) =>
  report.rows.find((r) => r.id === id)!

describe('what counts as a budget signal', () => {
  it('treats a named budget or an existing spend as real', () => {
    expect(hasRealBudget('strong')).toBe(true)
    expect(hasRealBudget('moderate')).toBe(true)
    expect(hasRealBudget('  Strong  ')).toBe(true)
  })

  it('treats interest as not a budget signal', () => {
    expect(hasRealBudget('weak')).toBe(false)
    expect(hasRealBudget('none')).toBe(false)
    expect(hasRealBudget('')).toBe(false)
    expect(hasRealBudget(null)).toBe(false)
    expect(hasRealBudget(undefined)).toBe(false)
  })
})

describe('convergence against the agreed minimum', () => {
  it('does not converge on two conversations, however strong', () => {
    const r = buildInterviewReport([capture(), capture()], SEGMENTS, 2)
    const s = seg(r, 's1')
    expect(s.held).toBe(2)
    expect(s.meetsMinimum).toBe(true)
    expect(s.converging).toBe(2)
    expect(s.converges).toBe(false)
  })

  it('converges at three even when the minimum is higher and unmet', () => {
    const r = buildInterviewReport([capture(), capture(), capture()], SEGMENTS, 8)
    const s = seg(r, 's1')
    expect(s.meetsMinimum).toBe(false)
    expect(s.converges).toBe(true)
  })

  it('does not lower the bar when the engagement agreed a smaller minimum', () => {
    // The point of the whole module: agreeing to hold one conversation does
    // not make one conversation into evidence.
    const r = buildInterviewReport([capture()], SEGMENTS, 1)
    const s = seg(r, 's1')
    expect(s.meetsMinimum).toBe(true)
    expect(s.converges).toBe(false)
    expect(CONVERGENCE_MINIMUM).toBe(3)
  })

  it('meets a minimum of zero with nothing, and still does not converge', () => {
    const r = buildInterviewReport([], SEGMENTS, 0)
    const s = seg(r, 's1')
    expect(s.held).toBe(0)
    expect(s.meetsMinimum).toBe(true)
    expect(s.converges).toBe(false)
  })
})

describe('what a converging conversation has to carry', () => {
  it('does not count a budget with no confirmed problem', () => {
    const rows = [
      capture({ assumption_confirmed: false }),
      capture({ assumption_confirmed: false }),
      capture({ assumption_confirmed: false }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    expect(s.withBudget).toBe(3)
    expect(s.converging).toBe(0)
    expect(s.converges).toBe(false)
  })

  it('does not count a confirmed problem with no budget', () => {
    const rows = [
      capture({ budget_signal_strength: 'weak' }),
      capture({ budget_signal_strength: 'none' }),
      capture({ budget_signal_strength: null }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    expect(s.confirmed).toBe(3)
    expect(s.withBudget).toBe(0)
    expect(s.converges).toBe(false)
  })

  it('counts only the conversations carrying both', () => {
    const rows = [
      capture(),
      capture(),
      capture({ budget_signal_strength: 'weak' }),
      capture({ assumption_confirmed: false }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    expect(s.held).toBe(4)
    expect(s.converging).toBe(2)
    expect(s.converges).toBe(false)
  })
})

describe('which conversations count at all', () => {
  it('ignores drafts entirely and reports how many are waiting', () => {
    const rows = [capture(), capture(), capture({ status: 'draft' }), capture({ status: 'draft' })]
    const r = buildInterviewReport(rows, SEGMENTS, 5)
    expect(r.submitted).toBe(2)
    expect(r.drafts).toBe(2)
    expect(seg(r, 's1').held).toBe(2)
  })

  it('never lets a draft tip a segment into converging', () => {
    const rows = [capture(), capture(), capture({ status: 'draft' })]
    expect(seg(buildInterviewReport(rows, SEGMENTS, 5), 's1').converges).toBe(false)
  })
})

describe('matching a conversation to a segment', () => {
  it('matches regardless of case and surrounding space', () => {
    const rows = [capture({ segment: '  commercial FARMS ' })]
    expect(seg(buildInterviewReport(rows, SEGMENTS, 5), 's1').held).toBe(1)
  })

  it('groups an unrecognised segment rather than dropping it', () => {
    const rows = [capture({ segment: 'Cooperatives' }), capture({ segment: null })]
    const r = buildInterviewReport(rows, SEGMENTS, 5)
    expect(r.submitted).toBe(2)
    expect(seg(r, UNASSIGNED).held).toBe(2)
  })

  it('leaves the unassigned row out entirely when everything is placed', () => {
    const r = buildInterviewReport([capture()], SEGMENTS, 5)
    expect(r.rows.some((x) => x.id === UNASSIGNED)).toBe(false)
    expect(r.rows).toHaveLength(2)
  })

  it('lists a segment with no conversations rather than hiding it', () => {
    const r = buildInterviewReport([capture()], SEGMENTS, 5)
    const s = seg(r, 's2')
    expect(s.held).toBe(0)
    expect(s.converges).toBe(false)
  })
})

describe('the dimension scores', () => {
  it('reports a spread rather than an average', () => {
    const rows = [
      capture({ problem_reality_score: 5, budget_authority_score: 1 }),
      capture({ problem_reality_score: 5, budget_authority_score: 1 }),
      capture({ problem_reality_score: 3, budget_authority_score: 3 }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    const problem = s.dimensions.find((d) => d.key === 'problem_reality')!
    const budget = s.dimensions.find((d) => d.key === 'budget_authority')!

    // Both would average to a shade over three, and they are nothing alike.
    expect(problem.spread).toEqual([0, 0, 1, 0, 2])
    expect(budget.spread).toEqual([2, 0, 1, 0, 0])
    expect(problem.low).toBe(3)
    expect(problem.high).toBe(5)
  })

  it('ignores a score that is missing, zero or out of range', () => {
    const rows = [
      capture({ problem_reality_score: 0 }),
      capture({ problem_reality_score: 9 }),
      capture({ problem_reality_score: null }),
      capture({ problem_reality_score: 4 }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    const d = s.dimensions.find((x) => x.key === 'problem_reality')!
    expect(d.scored).toBe(1)
    expect(d.low).toBe(4)
    expect(d.high).toBe(4)
  })

  it('says nothing rather than zero when a dimension was never scored', () => {
    const s = seg(buildInterviewReport([capture()], SEGMENTS, 5), 's1')
    const d = s.dimensions.find((x) => x.key === 'willingness_to_pay')!
    expect(d.scored).toBe(0)
    expect(d.low).toBeNull()
    expect(d.high).toBeNull()
  })

  it('reports all six dimensions in the order the workbook lists them', () => {
    const s = seg(buildInterviewReport([capture()], SEGMENTS, 5), 's1')
    expect(s.dimensions.map((d) => d.key)).toEqual([
      'role_accountability',
      'problem_reality',
      'consequence_severity',
      'current_attempts',
      'budget_authority',
      'willingness_to_pay',
    ])
  })
})

describe('the other things a conversation records', () => {
  it('counts overturned assumptions as a finding of their own', () => {
    const rows = [capture({ assumption_overturned: true }), capture()]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    expect(s.overturned).toBe(1)
  })

  it('collects the verbatims and drops the blank ones', () => {
    const rows = [
      capture({ most_important_verbatim: 'We already pay someone to do this badly.' }),
      capture({ most_important_verbatim: '   ' }),
      capture({ most_important_verbatim: null }),
    ]
    const s = seg(buildInterviewReport(rows, SEGMENTS, 5), 's1')
    expect(s.verbatims).toEqual(['We already pay someone to do this badly.'])
  })

  it('handles an engagement with nothing recorded at all', () => {
    const r = buildInterviewReport([], [], 5)
    expect(r.rows).toEqual([])
    expect(r.submitted).toBe(0)
    expect(r.drafts).toBe(0)
  })
})
