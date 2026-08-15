// ============================================================
// THE HIERARCHY, AND THE TEST C26 WROTE FOR ITSELF
//
// The replacement carries its own test, quoted here so a later reader can see
// that what is asserted is what was asked for rather than what was convenient:
//
//   "a service with three activities; the first has two problems, the second
//    one, the third none. Tool 2 shows the service once at the top, all three
//    activities beneath it, two problems under the first, one under the second,
//    and the third showing no problems.
//    Fails if: service and activity appear combined in one column, or the
//    display suggests one activity per service."
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  activityLabel,
  hierarchyForService,
  hypothesisBuild,
  NO_PROBLEM_STATED,
  problemLabel,
  problemsOutsideHierarchy,
  orderActivitiesForTable,
  splitRowsByService,
  type HypothesisSource,
} from '@/lib/phase-zero-hierarchy'
import type { Activity, Problem, Service } from '@/lib/service-anchor'

const service: Service = {
  id: 'svc-1', service_name: 'Gender advisory', service_state: 'current', decision: null,
}

const activity = (id: string, name: string, over: Partial<Activity> = {}): Activity => ({
  id, service_id: 'svc-1', activity: name, parked_at: null, decision: null, ...over,
})
const problem = (id: string, activityId: string, text: string, over: Partial<Problem> = {}): Problem => ({
  id, activity_id: activityId, problem: text, parked_at: null, decision: null, ...over,
})

describe("C26's own test, on the hierarchy", () => {
  const activities = [
    activity('a1', 'Facilitator training'),
    activity('a2', 'Policy review'),
    activity('a3', 'Community outreach'),
  ]
  const problems = [
    problem('p1', 'a1', 'Facilitators leave within a year'),
    problem('p2', 'a1', 'Training is not costed'),
    problem('p3', 'a2', 'Reviews arrive after the budget closes'),
  ]
  const tree = hierarchyForService(service, activities, problems)

  it('shows the service ONCE, at the top, as the frame', () => {
    expect(tree.service?.id).toBe('svc-1')
    // The service is the frame, never a value on a row. Nothing in a branch
    // carries a service name to put in a cell.
    for (const branch of tree.branches) {
      expect(branch).not.toHaveProperty('service_name')
      expect(Object.keys(branch)).toEqual(['activity', 'problems', 'noProblemStated'])
    }
  })

  it('shows all three activities beneath it', () => {
    expect(tree.branches.map((b) => b.activity.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('puts two problems under the first and one under the second', () => {
    expect(tree.branches[0].problems.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(tree.branches[1].problems.map((p) => p.id)).toEqual(['p3'])
  })

  it('shows the third activity, showing no problems', () => {
    // The activity is PRESENT. C23 would have removed it; C26's replacement is
    // later, more specific, and carries this test, so it wins.
    expect(tree.branches[2].activity.id).toBe('a3')
    expect(tree.branches[2].problems).toEqual([])
    expect(tree.branches[2].noProblemStated).toBe(true)
  })

  it('does not suggest one activity per service', () => {
    expect(tree.branches.length).toBeGreaterThan(1)
    expect(tree.problemCount).toBe(3)
  })

  it('treats a problem row with no words as nothing stated', () => {
    const blankOnly = hierarchyForService(service, [activity('a9', 'Mentoring')], [
      problem('p9', 'a9', '   '),
    ])
    expect(blankOnly.branches[0].noProblemStated).toBe(true)
    expect(problemLabel(blankOnly.branches[0].problems[0])).toBe(NO_PROBLEM_STATED)
  })

  it('carries ten or more activities without capping them', () => {
    const many = Array.from({ length: 14 }, (_, i) => activity(`m${i}`, `Activity ${i}`))
    expect(hierarchyForService(service, many, []).branches).toHaveLength(14)
  })

  it('leaves out a parked activity and another service\'s activity', () => {
    const mixed = [
      activity('a1', 'Kept'),
      activity('a2', 'Parked', { parked_at: '2026-08-12T10:00:00Z' }),
      activity('a3', 'Elsewhere', { service_id: 'svc-2' }),
    ]
    expect(hierarchyForService(service, mixed, []).branches.map((b) => b.activity.id)).toEqual(['a1'])
  })

  it('names an unnamed activity rather than showing an empty cell', () => {
    expect(activityLabel(activity('a1', ''))).toBe('Unnamed activity')
  })
})

describe('C28 as amended: nothing disappears for lack of a service', () => {
  const rows = [
    { id: 'r1', service_id: 'svc-1', parked_at: null },
    { id: 'r2', service_id: null, parked_at: null },
    { id: 'r3', service_id: 'svc-2', parked_at: null },
    { id: 'r4', service_id: 'svc-1', parked_at: '2026-08-12T10:00:00Z' },
  ]

  it('shows the anchored service\'s rows', () => {
    expect(splitRowsByService(rows, 'svc-1').anchored.map((r) => r.id)).toEqual(['r1'])
  })

  it('sends a row with NO service to the Parked area, not to nowhere', () => {
    const split = splitRowsByService(rows, 'svc-1')
    expect(split.parked.map((r) => r.id)).toEqual(['r2', 'r4'])
    // The whole point of the amendment: it is visible somewhere.
    const drawn = [...split.anchored, ...split.parked].map((r) => r.id)
    expect(drawn).toContain('r2')
  })

  it('is the only thing that leaves the screen: a row under another service', () => {
    expect(splitRowsByService(rows, 'svc-1').elsewhere.map((r) => r.id)).toEqual(['r3'])
  })

  it('hides NOTHING on an engagement where no row has a service yet', () => {
    // The live case. Every row is unassigned, and a filter would have shown an
    // empty screen to a room mid-session.
    const none = [
      { id: 'x1', service_id: null, parked_at: null },
      { id: 'x2', service_id: null, parked_at: null },
    ]
    const split = splitRowsByService(none, 'svc-1')
    expect(split.elsewhere).toHaveLength(0)
    expect(split.parked).toHaveLength(2)
  })

  it('parks everything where no service is anchored at all', () => {
    const split = splitRowsByService(rows, null)
    expect(split.anchored).toHaveLength(0)
    expect(split.elsewhere).toHaveLength(0)
    expect(split.parked).toHaveLength(4)
  })
})

describe('nothing is invisible: every problem the hierarchy cannot draw', () => {
  // A parked problem used to appear in NO list anywhere and could not be
  // found, edited or restored. These are the four cases, and the one that is
  // deliberately NOT parked.
  const activities = [
    activity('a-live', 'In this service'),
    activity('a-parked', 'Parked activity', { parked_at: '2026-08-12T10:00:00Z' }),
    activity('a-noservice', 'No service', { service_id: null }),
    activity('a-other', 'Another service', { service_id: 'svc-2' }),
  ]
  const problems = [
    problem('p-live', 'a-live', 'Drawn under its activity'),
    problem('p-parked', 'a-live', 'Parked problem', { parked_at: '2026-08-12T11:00:00Z' }),
    problem('p-orphan', 'gone', 'Its activity no longer exists'),
    problem('p-stranded', 'a-noservice', 'Its activity has no service'),
    problem('p-under-parked', 'a-parked', 'Its activity is parked'),
    problem('p-other', 'a-other', 'Under another service'),
  ]
  const out = problemsOutsideHierarchy(problems, activities)
  const ids = out.map((p) => p.id)

  it('rescues a PARKED problem, which was reachable from nowhere at all', () => {
    expect(ids).toContain('p-parked')
  })

  it('rescues one whose activity no longer exists', () => {
    expect(ids).toContain('p-orphan')
  })

  it('rescues one whose activity has no service', () => {
    // The case that made nineteen problems vanish: the activity was not drawn
    // under any service, so its problems went with it.
    expect(ids).toContain('p-stranded')
  })

  it('rescues one whose activity is itself parked', () => {
    expect(ids).toContain('p-under-parked')
  })

  it('leaves a problem that IS drawn where it is', () => {
    expect(ids).not.toContain('p-live')
  })

  it('does not call a problem parked when switching the anchor would show it', () => {
    // Under another service is reachable already. Listing it as parked would
    // say something untrue about it.
    expect(ids).not.toContain('p-other')
  })

  // ── 15 August 2026. THE PARENT IS THE SERVICE. ──────────────
  //
  // A problem stated the new way belongs to a service and has no activity at
  // all — that is the ordinary state between Tool 1's first question and its
  // second. This function asked only about activities, so every one of those
  // correct rows was reported as parked and shown in the bin.
  describe('a problem parented by its SERVICE', () => {
    const services = [{ id: 'svc-1' }, { id: 'svc-2', parked_at: '2026-08-12T10:00:00Z' }]

    it('is drawn, not parked, when no activity solves it yet', () => {
      const p = { ...problem('p-new', null as unknown as string, 'Stated in Tool 1'), service_id: 'svc-1' }
      expect(problemsOutsideHierarchy([p], activities, services).map((x) => x.id)).toEqual([])
    })

    it('is still parked when its service is parked', () => {
      const p = { ...problem('p-svc-parked', null as unknown as string, 'Its service is parked'), service_id: 'svc-2' }
      expect(problemsOutsideHierarchy([p], activities, services).map((x) => x.id)).toEqual(['p-svc-parked'])
    })

    it('is still parked when parked itself, whatever its service says', () => {
      const p = {
        ...problem('p-both', null as unknown as string, 'Parked', { parked_at: '2026-08-12T11:00:00Z' }),
        service_id: 'svc-1',
      }
      expect(problemsOutsideHierarchy([p], activities, services).map((x) => x.id)).toEqual(['p-both'])
    })
  })

  it('accounts for every problem exactly once, drawn or parked', () => {
    const drawn = hierarchyForService(service, activities, problems)
      .branches.flatMap((b) => b.problems.map((p) => p.id))
    const reachableElsewhere = ['p-other']
    expect([...drawn, ...ids, ...reachableElsewhere].sort())
      .toEqual(problems.map((p) => p.id).sort())
  })
})

describe('what a hypothesis is built from', () => {
  const activities = [activity('a1', 'Training'), activity('a2', 'Policy review'), activity('a3', 'Outreach')]
  const problems = [
    problem('p1', 'a1', 'Facilitators leave'),
    problem('p2', 'a3', 'Nobody attends'),
  ]
  const sources: HypothesisSource[] = [
    { id: 's1', hypothesis_id: 'h1', activity_id: 'a2', problem_id: null },
    { id: 's2', hypothesis_id: 'h1', activity_id: null, problem_id: 'p1' },
    { id: 's3', hypothesis_id: 'h2', activity_id: null, problem_id: 'p2' },
  ]

  it('shows the activities AND problems it is built from', () => {
    const built = hypothesisBuild('h1', sources, activities, problems)
    expect(built.problems.map((p) => p.id)).toEqual(['p1'])
    // a2 was named directly; a1 arrives because p1 belongs to it.
    expect(built.activities.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('brings a named problem\'s activity with it, so the hierarchy is never broken', () => {
    const built = hypothesisBuild('h2', sources, activities, problems)
    expect(built.problems.map((p) => p.id)).toEqual(['p2'])
    expect(built.activities.map((a) => a.id)).toEqual(['a3'])
  })

  it('reports nothing for a hypothesis nobody has attributed yet', () => {
    const built = hypothesisBuild('h-none', sources, activities, problems)
    expect(built.activities).toEqual([])
    expect(built.problems).toEqual([])
  })
})

// ============================================================
// THE SERVICE NAME REPEATING ON EVERY ROW.
//
// Tool 1 writes the service name once per group by comparing each row with the
// one above it, so it is only correct while the rows of one service are
// adjacent. The order used to be looked up in a list that arrives in a separate
// request; before it landed, two services interleaved and the name repeated
// down the whole column.
// ============================================================
describe('Tool 1 keeps the rows of one service together', () => {
  const rows = [
    { id: '1', service_id: 'svc-b', problem_id: 'p2', sort_order: 0 },
    { id: '2', service_id: 'svc-a', problem_id: 'p1', sort_order: 0 },
    { id: '3', service_id: 'svc-b', problem_id: 'p1', sort_order: 1 },
    { id: '4', service_id: 'svc-a', problem_id: 'p3', sort_order: 1 },
  ]

  /** How the table decides whether to write the name again. */
  const repeats = (ordered: { service_id: string | null }[]) =>
    ordered.filter((r, i) => i > 0 && r.service_id !== ordered[i - 1].service_id).length

  it('groups them even when the services list has not arrived yet', () => {
    // The empty list is the first paint, every time.
    const out = orderActivitiesForTable(rows, [])
    expect(repeats(out)).toBe(1) // one change of service, not three
  })

  it('groups them once the services list has arrived', () => {
    const out = orderActivitiesForTable(rows, [{ id: 'svc-a' }, { id: 'svc-b' }])
    expect(out.map((r) => r.service_id)).toEqual(['svc-a', 'svc-a', 'svc-b', 'svc-b'])
  })

  it('puts rows with no service at the end, together', () => {
    const withOrphans = [...rows, { id: '5', service_id: null, problem_id: null, sort_order: 0 }]
    const out = orderActivitiesForTable(withOrphans, [{ id: 'svc-a' }, { id: 'svc-b' }])
    expect(out[out.length - 1].service_id).toBe(null)
  })

  it('does not reorder the groups when the list arrives, only refines them', () => {
    // Same rows, ranked two ways: adjacency holds in both, which is what the
    // name-once rule depends on.
    for (const services of [[], [{ id: 'svc-a' }, { id: 'svc-b' }], [{ id: 'svc-b' }, { id: 'svc-a' }]]) {
      expect(repeats(orderActivitiesForTable(rows, services))).toBe(1)
    }
  })
})
