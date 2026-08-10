// ============================================================
// Bringing the problems across from the segments.
//
// The behaviour worth pinning is what is left OUT: a segment already scored,
// and a segment with no problem written yet. Offering either would put the
// team back where they started, retyping or staring at a blank row.
// ============================================================
import { describe, it, expect } from 'vitest'
import { segmentsAwaitingScore, carriedRow } from '@/lib/gtcv-problem-carryover'

const segments = [
  { id: 's1', segment_name: 'District health offices', problem_in_their_words: 'We cannot prove our cold chain held' },
  { id: 's2', segment_name: 'Seed companies', problem_in_their_words: 'Our agents give inconsistent advice' },
  { id: 's3', segment_name: 'Not yet explored', problem_in_their_words: '' },
]

describe('which segments are waiting to be scored', () => {
  it('offers a segment whose problem is written but not scored', () => {
    expect(segmentsAwaitingScore(segments, []).map((c) => c.segmentId)).toEqual(['s1', 's2'])
  })

  it('leaves out a segment that has already been scored', () => {
    const waiting = segmentsAwaitingScore(segments, [{ segment_id: 's1' }])
    expect(waiting.map((c) => c.segmentId)).toEqual(['s2'])
  })

  it('leaves out a segment with no problem written yet', () => {
    // s3 has a name but nothing to carry. Offering it would add a blank row,
    // which is the thing this replaces.
    expect(segmentsAwaitingScore(segments, []).some((c) => c.segmentId === 's3')).toBe(false)
  })

  it('ignores scored rows that are not linked to any segment', () => {
    // A problem typed straight into the scoring table has no segment. It must
    // not silently mark a segment as done.
    const waiting = segmentsAwaitingScore(segments, [{ segment_id: null }, { segment_id: undefined }])
    expect(waiting.map((c) => c.segmentId)).toEqual(['s1', 's2'])
  })

  it('offers nothing once every written problem is scored', () => {
    const waiting = segmentsAwaitingScore(segments, [{ segment_id: 's1' }, { segment_id: 's2' }])
    expect(waiting).toEqual([])
  })

  it('carries the words as the customer said them', () => {
    const [first] = segmentsAwaitingScore(segments, [])
    expect(first.problem).toBe('We cannot prove our cold chain held')
  })

  it('trims stray whitespace but does not reword', () => {
    const [only] = segmentsAwaitingScore(
      [{ id: 'x', segment_name: ' Clinics ', problem_in_their_words: '  Stock runs out mid-month  ' }],
      [],
    )
    expect(only.problem).toBe('Stock runs out mid-month')
    expect(only.segmentName).toBe('Clinics')
  })

  it('names a segment that has none, rather than showing an empty label', () => {
    const [only] = segmentsAwaitingScore(
      [{ id: 'x', segment_name: '', problem_in_their_words: 'Something hurts' }],
      [],
    )
    expect(only.segmentName).toBe('Unnamed segment')
  })

  it('keeps two segments that feel the same problem apart', () => {
    // Urgency and access differ by segment even when the sentence does not, so
    // matching on wording would wrongly collapse two real rows into one.
    const same = [
      { id: 'a', segment_name: 'Clinics', problem_in_their_words: 'Stock runs out' },
      { id: 'b', segment_name: 'Districts', problem_in_their_words: 'Stock runs out' },
    ]
    expect(segmentsAwaitingScore(same, []).map((c) => c.segmentId)).toEqual(['a', 'b'])
  })
})

describe('the row that gets written', () => {
  it('keeps the words and the segment together', () => {
    const [carry] = segmentsAwaitingScore(segments, [])
    expect(carriedRow(carry, 'client-1', 3)).toEqual({
      client_id: 'client-1',
      segment_id: 's1',
      segment_label: 'District health offices',
      problem_statement: 'We cannot prove our cold chain held',
      sort_order: 3,
    })
  })
})
