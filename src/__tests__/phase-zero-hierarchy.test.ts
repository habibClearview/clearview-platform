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
