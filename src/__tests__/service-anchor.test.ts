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
    moveIntoService(S2, ['a1'], [activity('a1', { decision: 'carry' })])
    // The problems reference the activity, not the service, so a move cannot
    // strand them. This is the reason the join is where it is.
    expect(problemsOfActivity('a1', problems)).toHaveLength(2)
  })
})

describe('Part D. The counter (C30, C31)', () => {
  const activities = [
    activity('a1', { decision: 'carry' }),
    activity('a2', { decision: 'kill' }),
    activity('a3', { decision: 'pause' }),
    activity('a4'),
    activity('b1', { service_id: S2, decision: 'kill' }),
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
