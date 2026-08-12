import { describe, it, expect } from 'vitest'
import {
  DEFAULT_REMOVAL,
  NO_PROBLEM_STATED,
  REMOVAL_LABELS,
  activitiesForToolTwo,
  activitiesOfService,
  counterForPortfolio,
  counterForService,
  deleteConfirmation,
  hasNoProblemStated,
  moveIntoService,
  parkedActivities,
  problemsOfActivity,
  refuseOrphanActivity,
  LATE_ANSWER_REFUSED,
  acceptsLateAnswer,
  identityLine,
  questionPosition,
  defaultVisibility,
  mayShowAnswers,
  mayShowNames,
  type Activity,
  type Problem,
} from '../lib/service-anchor'

const S1 = 'svc-1'
const S2 = 'svc-2'

function activity(id: string, over: Partial<Activity> = {}): Activity {
  return { id, service_id: S1, activity: id, parked_at: null, decision: null, ...over }
}
function problem(id: string, activityId: string | null, text = 'a problem'): Problem {
  return { id, activity_id: activityId, problem: text, parked_at: null, decision: null }
}

describe('C2. An activity cannot exist without a parent service', () => {
  it('refuses an orphan', () => {
    expect(refuseOrphanActivity(null)).toBe('Choose which service this activity belongs to')
    expect(refuseOrphanActivity(undefined)).toBeTruthy()
    expect(refuseOrphanActivity('')).toBeTruthy()
  })

  it('allows one with a parent', () => {
    expect(refuseOrphanActivity(S1)).toBeNull()
  })
})

describe('C3. A problem belongs to one activity, and an activity may have none', () => {
  const problems = [problem('p1', 'a1'), problem('p2', 'a1'), problem('p3', 'a2')]

  it('holds two problems on one activity', () => {
    expect(problemsOfActivity('a1', problems)).toHaveLength(2)
  })

  it('accepts an activity with none, without an error', () => {
    expect(problemsOfActivity('a3', problems)).toEqual([])
  })
})

describe('C22 and C23. No problem stated', () => {
  it('is true where nothing is stated, and where the words are blank', () => {
    expect(hasNoProblemStated('a1', [])).toBe(true)
    expect(hasNoProblemStated('a1', [problem('p1', 'a1', '   ')])).toBe(true)
    // An empty row is not a stated problem. Somebody adding a row and not
    // typing in it has not stated anything.
    expect(hasNoProblemStated('a1', [problem('p1', 'a1', '')])).toBe(true)
  })

  it('is false as soon as one is stated', () => {
    expect(hasNoProblemStated('a1', [problem('p1', 'a1', 'Yields are low')])).toBe(false)
  })

  it('keeps such an activity OUT of Tool 2 entirely', () => {
    const activities = [activity('a1'), activity('a2')]
    const problems = [problem('p1', 'a1', 'Yields are low')]
    const shown = activitiesForToolTwo(activities, problems)
    expect(shown.map((a) => a.id)).toEqual(['a1'])
    // C23 fails if it appears there with empty fields. It is absent.
    expect(shown.find((a) => a.id === 'a2')).toBeUndefined()
  })

  it('has words of its own rather than being an empty cell', () => {
    expect(NO_PROBLEM_STATED).toBe('No problem stated')
  })

  it('C24. It is still counted, so Tool 5 can resolve it', () => {
    const activities = [activity('a1'), activity('a2')]
    const c = counterForService(S1, activities, [problem('p1', 'a1', 'Yields are low')])
    expect(c.startedWith).toBe(2)
    expect(c.noProblemStated).toBe(1)
    // Not auto-killed. C24's test fails if it never reaches Tool 5.
    expect(c.killed).toBe(0)
  })
})

describe('C12 to C16. Three removal actions, and park is the default', () => {
  it('names all three in the agreed words', () => {
    expect(REMOVAL_LABELS.delete).toBe('Delete')
    expect(REMOVAL_LABELS.move).toBe('Move to another service')
    expect(REMOVAL_LABELS.park).toBe('Park')
  })

  it('C16. Park is the default and delete never is', () => {
    expect(DEFAULT_REMOVAL).toBe('park')
    expect(DEFAULT_REMOVAL).not.toBe('delete')
  })

  it('C13. The confirmation uses the word delete', () => {
    expect(deleteConfirmation('Farmer training').toLowerCase()).toContain('delete')
  })
})

describe('C7 and C15. The parked bucket', () => {
  it('holds what was parked and what never had a service', () => {
    const activities = [
      activity('a1'),
      activity('a2', { parked_at: '2026-08-12T09:00:00Z' }),
      // Written before services were the anchor. Never parked by anybody.
      activity('a3', { service_id: null }),
    ]
    expect(parkedActivities(activities).map((a) => a.id).sort()).toEqual(['a2', 'a3'])
  })

  it('keeps parked items out of their old service', () => {
    const activities = [activity('a1'), activity('a2', { parked_at: '2026-08-12T09:00:00Z' })]
    expect(activitiesOfService(S1, activities).map((a) => a.id)).toEqual(['a1'])
  })

  it('C15. A parked activity pulls into a NEW service, complete', () => {
    const parked = activity('a2', { service_id: null, parked_at: '2026-08-12T09:00:00Z' })
    const problems = [problem('p1', 'a2'), problem('p2', 'a2')]

    const moved = moveIntoService('svc-new', ['a2'], [parked])
    expect(moved[0].service_id).toBe('svc-new')
    // Out of the bucket, because it has a home again.
    expect(moved[0].parked_at).toBeNull()
    // Its problems hang off the activity, so they were never separated from it.
    expect(problemsOfActivity('a2', problems)).toHaveLength(2)
  })
})

describe('C14 and C18. Moving carries everything', () => {
  it('moves the chosen activities and leaves the rest alone', () => {
    const activities = [activity('a1'), activity('a2'), activity('a3', { service_id: S2 })]
    const moved = moveIntoService('svc-new', ['a1', 'a3'], activities)
    expect(moved.map((a) => a.id).sort()).toEqual(['a1', 'a3'])
    expect(moved.every((a) => a.service_id === 'svc-new')).toBe(true)
  })

  it('C14. A move is a change of parent, never a copy', () => {
    const activities = [activity('a1')]
    const moved = moveIntoService(S2, ['a1'], activities)
    // Same identity. A copy would leave the room looking at the same activity
    // twice, unable to tell which one was real.
    expect(moved[0].id).toBe('a1')
    expect(moved).toHaveLength(1)
  })

  it('C14. Problems and what is recorded against them survive the move', () => {
    const problems = [problem('p1', 'a1'), problem('p2', 'a1')]
    moveIntoService(S2, ['a1'], [activity('a1', { decision: 'keep' })])
    // The problems reference the activity, not the service, so a move cannot
    // strand them. This is the reason the join is where it is.
    expect(problemsOfActivity('a1', problems)).toHaveLength(2)
  })
})

describe('Part D. The counter (C30, C31)', () => {
  const activities = [
    activity('a1', { decision: 'keep' }),
    activity('a2', { decision: 'stop' }),
    activity('a3', { decision: 'pause' }),
    activity('a4'),
    activity('b1', { service_id: S2, decision: 'stop' }),
    activity('b2', { service_id: S2 }),
    activity('gone', { service_id: null, parked_at: '2026-08-12T09:00:00Z' }),
  ]
  const problems = [
    problem('p1', 'a1'), problem('p2', 'a2'), problem('p3', 'a3'),
    problem('p4', 'b1'),
  ]

  it('C30. Shows five figures for one service', () => {
    const c = counterForService(S1, activities, problems)
    expect(c).toEqual({
      startedWith: 4, noProblemStated: 1, killed: 1, paused: 1, carriedForward: 1,
    })
  })

  it('started with does not shrink when something is killed', () => {
    // The whole point of showing it beside the kills.
    const c = counterForService(S1, activities, problems)
    expect(c.startedWith).toBe(4)
  })

  it('a redesigned activity counts as carried forward', () => {
    // It survives the gate, in a different shape. Counting it anywhere else
    // would make the five figures fail to add up to the activities that exist.
    const c = counterForService(S1, [activity('r1', { decision: 'redesign' })], [])
    expect(c.carriedForward).toBe(1)
    expect(c.killed).toBe(0)
  })

  it('C31. The portfolio figures equal the sum of the service figures', () => {
    const s1 = counterForService(S1, activities, problems)
    const s2 = counterForService(S2, activities, problems)
    const all = counterForPortfolio(activities, problems)
    expect(all.startedWith).toBe(s1.startedWith + s2.startedWith)
    expect(all.killed).toBe(s1.killed + s2.killed)
    expect(all.paused).toBe(s1.paused + s2.paused)
    expect(all.carriedForward).toBe(s1.carriedForward + s2.carriedForward)
    expect(all.noProblemStated).toBe(s1.noProblemStated + s2.noProblemStated)
  })

  it('a parked activity is counted under no service', () => {
    const all = counterForPortfolio(activities, problems)
    // 6 live, not 7. Counting a parked row under a service it has left would
    // make the figures disagree with the screen above them.
    expect(all.startedWith).toBe(6)
  })
})


describe('C43. Finishing an answer after the facilitator has moved on', () => {
  it('accepts the answer to the question that just closed', () => {
    expect(acceptsLateAnswer('q1', 'q1', false)).toBe(true)
  })

  it('refuses it once that question was revealed', () => {
    // A reveal is the moment the room reads the numbers off the wall. An
    // answer after that changes what everybody has already seen.
    expect(acceptsLateAnswer('q1', 'q1', true)).toBe(false)
  })

  it('refuses an answer to any question other than the one that just closed', () => {
    expect(acceptsLateAnswer('q0', 'q1', false)).toBe(false)
    expect(acceptsLateAnswer('q1', null, false)).toBe(false)
    expect(acceptsLateAnswer(null, 'q1', false)).toBe(false)
    expect(acceptsLateAnswer(undefined, undefined, false)).toBe(false)
  })

  it('tells the person, in the words agreed, rather than failing silently', () => {
    expect(LATE_ANSWER_REFUSED).toBe('That question has closed. Your answer was not recorded.')
  })
})

describe('C25 to C27. The carry forward is one row, not two copies', () => {
  // The whole of group 2 rests on this: a problem stated in Tool 1 IS a row in
  // Tool 2's table. These assert the property that makes that true, which is
  // that both tools read the same array and neither holds its own text.
  const activities = [activity('a1'), activity('a2')]
  const problems = [
    problem('p1', 'a1', 'Yields are low'),
    problem('p2', 'a1', 'Buyers pay late'),
    problem('p3', 'a2', 'Nobody is trained'),
  ]

  it('C25. Every problem stated in Tool 1 is present under its activity', () => {
    // Four stated, four found, nothing retyped anywhere.
    expect(problemsOfActivity('a1', problems).map((p) => p.problem))
      .toEqual(['Yields are low', 'Buyers pay late'])
    expect(problemsOfActivity('a2', problems).map((p) => p.problem))
      .toEqual(['Nobody is trained'])
  })

  it('C27. Editing the text changes what BOTH tools show, because there is one of it', () => {
    const edited = problems.map((p) => (p.id === 'p1' ? { ...p, problem: 'Yields collapsed' } : p))
    // Tool 1's view.
    expect(problemsOfActivity('a1', edited)[0].problem).toBe('Yields collapsed')
    // Tool 2's view is the same rows, so it cannot disagree.
    expect(edited.find((p) => p.id === 'p1')!.problem).toBe('Yields collapsed')
  })

  it('C27. Removing it in Tool 1 removes it from Tool 2', () => {
    const afterPark = problems.map((p) => (p.id === 'p1' ? { ...p, parked_at: '2026-08-12T10:00:00Z' } : p))
    expect(problemsOfActivity('a1', afterPark).map((p) => p.id)).toEqual(['p2'])
  })

  it('C21 with C23. An activity with two problems is in Tool 2; one with none is not', () => {
    const shown = activitiesForToolTwo(activities, [problems[0], problems[1]])
    expect(shown.map((a) => a.id)).toEqual(['a1'])
  })
})

describe('Part E. Who the participant is, and where they are (C34, C38)', () => {
  it('C34. Organisation, then name, then role', () => {
    expect(identityLine('Ikore', 'Grace Achieng', 'Field officer'))
      .toBe('Ikore, Grace Achieng, Field officer')
  })

  it('drops what is missing rather than leaving stray commas', () => {
    expect(identityLine(null, 'Grace Achieng', 'Field officer')).toBe('Grace Achieng, Field officer')
    expect(identityLine('Ikore', 'Grace Achieng', '')).toBe('Ikore, Grace Achieng')
    expect(identityLine(null, null, null)).toBe('')
  })

  it('C38. Reads as a position in the set, counting from one', () => {
    expect(questionPosition(1, 4)).toBe('Question 2 of 4')
    expect(questionPosition(0, 1)).toBe('Question 1 of 1')
  })
})

describe('Part H. Two switches, not one (C56 to C60)', () => {
  it('C57. Collect shows both; score and classify hide both', () => {
    expect(defaultVisibility('collect')).toEqual({ answersVisible: true, authorsVisible: true })
    expect(defaultVisibility('score')).toEqual({ answersVisible: false, authorsVisible: false })
    expect(defaultVisibility('classify')).toEqual({ answersVisible: false, authorsVisible: false })
  })

  it('C56. They are independent — answers visible with authors hidden works', () => {
    const v = { answersVisible: true, authorsVisible: false }
    expect(mayShowAnswers(v, false)).toBe(true)
    expect(mayShowNames(v)).toBe(false)
  })

  it('and the opposite way round', () => {
    const v = { answersVisible: false, authorsVisible: true }
    expect(mayShowAnswers(v, false)).toBe(false)
    expect(mayShowNames(v)).toBe(true)
  })

  it('a reveal opens the answers and NEVER the names', () => {
    // Revealing answers is not revealing people. C58 and C62 both turn on this.
    const v = { answersVisible: false, authorsVisible: false }
    expect(mayShowAnswers(v, true)).toBe(true)
    expect(mayShowNames(v)).toBe(false)
  })
})
