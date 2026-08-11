// ============================================================
// Stage 1: the rules behind the room.
//
// Each test names the requirement it holds, and where a requirement's own test
// in the specification gives an example, that example is used verbatim rather
// than a friendlier one.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  defaultIsNamed, normaliseForMatch, groupCollectSubmissions, suggestMerges,
  scoreDistribution, classifySplit, scoreExtremes, formatNames, answerCounter,
  type Submission, type TargetField,
} from '@/lib/stage1-questions'

const FIELDS: TargetField[] = [
  { column: 'activity', heading: 'Activity' },
  { column: 'delivers', heading: 'What it delivers' },
]

function collect(id: string, activity: string, name: string | null = null, delivers = ''): Submission {
  return {
    id, question_id: 'q1', participant_id: `p-${id}`, participant_name: name,
    values: { activity, delivers }, score_value: null, option_value: null,
    submitted_at: `2026-08-11T09:0${id}:00Z`, disposition: 'pending',
  }
}

function scored(id: string, value: number, name: string | null = null): Submission {
  return {
    id, question_id: 'q1', participant_id: `p-${id}`, participant_name: name,
    values: {}, score_value: value, option_value: null,
    submitted_at: '2026-08-11T09:00:00Z', disposition: 'pending',
  }
}

function classified(id: string, option: string): Submission {
  return {
    id, question_id: 'q1', participant_id: `p-${id}`, participant_name: null,
    values: {}, score_value: null, option_value: option,
    submitted_at: '2026-08-11T09:00:00Z', disposition: 'pending',
  }
}

describe('R19, the defaults by type', () => {
  it('makes score and classify anonymous, and collect named', () => {
    expect(defaultIsNamed('score')).toBe(false)
    expect(defaultIsNamed('classify')).toBe(false)
    expect(defaultIsNamed('collect')).toBe(true)
  })
})

describe('R22 and Q7, grouping identical answers', () => {
  it('sets aside capitals, punctuation and extra spaces', () => {
    expect(normaliseForMatch('  Farmer   Training! ')).toBe('farmer training')
    expect(normaliseForMatch('Farmer-training')).toBe('farmer training')
  })

  it('groups four identical submissions into one row with a count of four', () => {
    // R22's own test: four devices submit similar wording, one row appears.
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training', 'Ada'),
      collect('2', 'farmer training', 'Bem'),
      collect('3', 'Farmer Training.', 'Chi'),
      collect('4', '  farmer  training  ', 'Dayo'),
    ], FIELDS)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(4)
    expect(groups[0].contributors).toEqual(['Ada', 'Bem', 'Chi', 'Dayo'])
  })

  it('shows the wording as the first person typed it, not normalised', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer Training', 'Ada'),
      collect('2', 'farmer training', 'Bem'),
    ], FIELDS)
    expect(groups[0].display.activity).toBe('Farmer Training')
  })

  it('keeps genuinely different answers apart', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training'),
      collect('2', 'Cold chain repair'),
    ], FIELDS)
    expect(groups).toHaveLength(2)
  })

  it('does not fold together answers that differ in a second field', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training', null, 'A two day course'),
      collect('2', 'Farmer training', null, 'A one day refresher'),
    ], FIELDS)
    expect(groups).toHaveLength(2)
  })

  it('counts a person once however many times they sent the same answer', () => {
    const a = collect('1', 'Farmer training', 'Ada')
    const b = { ...collect('2', 'farmer training', 'Ada'), participant_id: a.participant_id }
    const groups = groupCollectSubmissions([a, b], FIELDS)
    expect(groups[0].contributors).toEqual(['Ada'])
    expect(groups[0].count).toBe(2)
  })

  it('carries every submission in the group, so acting on it covers them all', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training'),
      collect('2', 'farmer training'),
    ], FIELDS)
    expect(groups[0].submissions.map((s) => s.id)).toEqual(['1', '2'])
  })

  it('never merges on similarity by itself', () => {
    // "Farmer training" and "Training for farmers" are similar and must stay
    // two rows. A wrong merge destroys a distinct activity and nobody notices.
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training'),
      collect('2', 'Training for farmers'),
    ], FIELDS)
    expect(groups).toHaveLength(2)
  })

  it('offers the similar pair as a suggestion instead', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training'),
      collect('2', 'Farmer training programme'),
    ], FIELDS)
    expect(suggestMerges(groups, FIELDS)).toEqual([{ keepIndex: 0, mergeIndex: 1 }])
  })

  it('suggests nothing when the answers are unrelated', () => {
    const groups = groupCollectSubmissions([
      collect('1', 'Farmer training'),
      collect('2', 'Cold chain repair'),
    ], FIELDS)
    expect(suggestMerges(groups, FIELDS)).toEqual([])
  })
})

describe('R16, the distribution of a score question', () => {
  it('shows each value and how many chose it, for the example given', () => {
    // R16's own test: answered 1, 1, 4, 4, 4, 5.
    const rows = scoreDistribution([
      scored('1', 1), scored('2', 1), scored('3', 4),
      scored('4', 4), scored('5', 4), scored('6', 5),
    ], 1, 5)
    expect(rows).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 0 },
      { value: 3, count: 0 },
      { value: 4, count: 3 },
      { value: 5, count: 1 },
    ])
  })

  it('shows a value nobody chose at zero rather than leaving it out', () => {
    // Nobody scoring this a 2 or a 3 is the finding. A missing column hides it.
    const rows = scoreDistribution([scored('1', 1), scored('2', 5)], 1, 5)
    expect(rows.map((r) => r.value)).toEqual([1, 2, 3, 4, 5])
    expect(rows.map((r) => r.count)).toEqual([1, 0, 0, 0, 1])
  })

  it('shows the whole empty scale when nobody has answered', () => {
    const rows = scoreDistribution([], 1, 5)
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.count === 0)).toBe(true)
  })

  it('still shows an answer that falls outside the scale', () => {
    // Only reachable by narrowing a scale after people have answered. Dropping
    // it would quietly lose a real answer.
    const rows = scoreDistribution([scored('1', 9)], 1, 5)
    expect(rows.find((r) => r.value === 9)).toEqual({ value: 9, count: 1 })
  })
})

describe('the amendment to R25, the answer counter', () => {
  it('reads answers of room size when the facilitator has set one', () => {
    expect(answerCounter(7, 9)).toBe('7 of 9')
  })

  it('shows the answers alone when no room size is set', () => {
    // A correct state, not a failure: the facilitator has not said how many
    // people are in the room yet.
    expect(answerCounter(7, null)).toBe('7')
  })

  it('shows nothing odd before anyone has answered', () => {
    expect(answerCounter(0, 9)).toBe('0 of 9')
    expect(answerCounter(0, null)).toBe('0')
  })
})

describe('R17, the split of a classify question', () => {
  it('shows both counts, not only the majority', () => {
    const rows = classifySplit(
      [classified('1', 'Signal'), classified('2', 'Signal'), classified('3', 'Story')],
      ['Signal', 'Story'],
    )
    expect(rows).toEqual([{ option: 'Signal', count: 2 }, { option: 'Story', count: 1 }])
  })

  it('shows an option nobody chose at zero rather than dropping it', () => {
    // "Nobody said Story" is the finding, and a missing row hides it.
    const rows = classifySplit([classified('1', 'Signal')], ['Signal', 'Story'])
    expect(rows).toEqual([{ option: 'Signal', count: 1 }, { option: 'Story', count: 0 }])
  })
})

describe('R18 and Q10, who gave the highest and the lowest', () => {
  it('names both on a named question', () => {
    const e = scoreExtremes([scored('1', 1, 'Ada'), scored('2', 3, 'Bem'), scored('3', 5, 'Chi')], true)
    expect(e.highest).toEqual({ value: 5, names: ['Chi'] })
    expect(e.lowest).toEqual({ value: 1, names: ['Ada'] })
  })

  it('names nobody at all on an anonymous question', () => {
    const e = scoreExtremes([scored('1', 1, 'Ada'), scored('2', 5, 'Chi')], false)
    expect(e.highest).toBeNull()
    expect(e.lowest).toBeNull()
  })

  it('shows every tied name rather than picking one', () => {
    const e = scoreExtremes([
      scored('1', 5, 'Ada'), scored('2', 5, 'Bem'), scored('3', 2, 'Chi'),
    ], true)
    expect(e.highest!.names).toEqual(['Ada', 'Bem'])
  })

  it('returns nothing when nobody has answered', () => {
    expect(scoreExtremes([], true)).toEqual({ highest: null, lowest: null })
  })

  it('treats one answer as both the highest and the lowest', () => {
    const e = scoreExtremes([scored('1', 3, 'Ada')], true)
    expect(e.highest).toEqual({ value: 3, names: ['Ada'] })
    expect(e.lowest).toEqual({ value: 3, names: ['Ada'] })
  })
})

describe('R18 and Q10, how the names read', () => {
  it('lists up to three in full', () => {
    expect(formatNames(['Ada', 'Bem', 'Chi'])).toBe('Ada, Bem, Chi')
  })

  it('lists three and counts the rest correctly', () => {
    expect(formatNames(['Ada', 'Bem', 'Chi', 'Dayo', 'Emeka'])).toBe('Ada, Bem, Chi and 2 others')
  })

  it('says nothing when there are no names', () => {
    expect(formatNames([])).toBe('')
  })
})
