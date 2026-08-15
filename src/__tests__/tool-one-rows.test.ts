// ============================================================
// TOOL 1's ROWS: WHAT ACCEPT PUTS ON THE TABLE.
//
// The fault these are written against, in Habib's words: "when you click on
// accept, it doesn't show up on the table", and "the +add button on the
// problem, activity and others is still not working — I should be able to add
// more than one problem, more than one activity, more than one of all the
// attributes per service row".
//
// Both came from the same place: the rows WERE the activities. A problem with
// no activity had no row, so an accepted problem was invisible, and the add
// that was supposed to make a problem made an activity instead.
// ============================================================
import { describe, expect, it } from 'vitest'
import { buildTool1Rows } from '@/lib/phase-zero-hierarchy'

const svc = (id: string, sort = 0) => ({ id, sort_order: sort })
const prob = (id: string, service_id: string | null, sort = 0) => ({ id, service_id, sort_order: sort })
const act = (id: string, service_id: string | null, problem_id: string | null, sort = 0) =>
  ({ id, service_id, problem_id, sort_order: sort })

describe('a problem the room accepted appears, before anything solves it', () => {
  it('gives a problem with no activity a row of its own', () => {
    const rows = buildTool1Rows([svc('s1')], [prob('p1', 's1')], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].problemId).toBe('p1')
    expect(rows[0].activityId).toBe(null)
    // And it is where the activity gets added from.
    expect(rows[0].lastOfProblem).toBe(true)
  })

  it('shows every problem of a service, not just the ones with activities', () => {
    const rows = buildTool1Rows(
      [svc('s1')],
      [prob('p1', 's1', 0), prob('p2', 's1', 1), prob('p3', 's1', 2)],
      [act('a1', 's1', 'p2')],
    )
    expect(rows.map((r) => r.problemId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('puts several activities under one problem, each on its own row', () => {
    const rows = buildTool1Rows(
      [svc('s1')],
      [prob('p1', 's1')],
      [act('a1', 's1', 'p1', 0), act('a2', 's1', 'p1', 1), act('a3', 's1', 'p1', 2)],
    )
    expect(rows.map((r) => r.activityId)).toEqual(['a1', 'a2', 'a3'])
    // The problem is written once, on the first of them.
    expect(rows.map((r) => r.firstOfProblem)).toEqual([true, false, false])
    // The activity add sits at the end of the group, so it adds to THIS problem.
    expect(rows.map((r) => r.lastOfProblem)).toEqual([false, false, true])
  })
})

describe('the service is written once, and the adds belong to their group', () => {
  const rows = buildTool1Rows(
    [svc('s1', 0), svc('s2', 1)],
    [prob('p1', 's1'), prob('p2', 's1'), prob('p3', 's2')],
    [act('a1', 's1', 'p1'), act('a2', 's2', 'p3')],
  )

  it('marks the first row of each service, and only the first', () => {
    expect(rows.filter((r) => r.firstOfService).map((r) => r.serviceId)).toEqual(['s1', 's2'])
  })

  it('keeps a service\'s rows together', () => {
    expect(rows.map((r) => r.serviceId)).toEqual(['s1', 's1', 's2'])
  })

  it('puts the problem add at the end of the SERVICE, not the table', () => {
    const last = rows.filter((r) => r.lastOfService)
    expect(last.map((r) => r.serviceId)).toEqual(['s1', 's2'])
    // s1's add sits on its own last row, not below s2.
    expect(last[0].problemId).toBe('p2')
  })
})

describe('nothing is invisible', () => {
  it('gives an empty service a row, so it can be added to', () => {
    const rows = buildTool1Rows([svc('s1')], [], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].serviceId).toBe('s1')
    expect(rows[0].firstOfService).toBe(true)
    expect(rows[0].lastOfService).toBe(true)
  })

  it('keeps activities stated before anybody named the problem', () => {
    const rows = buildTool1Rows([svc('s1')], [prob('p1', 's1')], [act('a1', 's1', null)])
    expect(rows.map((r) => r.activityId)).toContain('a1')
    expect(rows.find((r) => r.activityId === 'a1')?.problemId).toBe(null)
  })

  it('draws rows that belong to no service at all', () => {
    const rows = buildTool1Rows([svc('s1')], [], [act('a1', null, null)])
    expect(rows.some((r) => r.serviceId === null && r.activityId === 'a1')).toBe(true)
  })

  it('leaves parked rows out, and only those', () => {
    const rows = buildTool1Rows(
      [svc('s1')],
      [{ ...prob('p1', 's1'), parked_at: '2026-08-15T10:00:00Z' }, prob('p2', 's1')],
      [{ ...act('a1', 's1', 'p2'), parked_at: '2026-08-15T10:00:00Z' }, act('a2', 's1', 'p2')],
    )
    expect(rows.map((r) => r.problemId)).toEqual(['p2'])
    expect(rows.map((r) => r.activityId)).toEqual(['a2'])
  })
})

// ============================================================
// A DRAFT IS A ROW ON THE SCREEN, NOT IN THE DATABASE.
//
// "all it does is show empty rows, with no data". Nine blank rows had been
// inserted by "+ add" and left there. A draft cannot do that: it exists only
// until the page is left, and becomes a row the moment it is typed into.
// ============================================================
describe('adding does not write an empty row', () => {
  const draft = (key: string, kind: 'activity' | 'problem', serviceId: string, problemId: string | null = null) =>
    ({ key, kind, serviceId, problemId })

  it('opens a draft activity at the end of the problem it will solve', () => {
    const rows = buildTool1Rows(
      [svc('s1')], [prob('p1', 's1')], [act('a1', 's1', 'p1')],
      [draft('d1', 'activity', 's1', 'p1')],
    )
    expect(rows.map((r) => r.activityId)).toEqual(['a1', null])
    expect(rows[1].draft?.key).toBe('d1')
    expect(rows[1].problemId).toBe('p1')
  })

  it('lets several drafts be open at once — the thing that was impossible', () => {
    const rows = buildTool1Rows(
      [svc('s1')], [prob('p1', 's1')], [],
      [draft('d1', 'activity', 's1', 'p1'), draft('d2', 'activity', 's1', 'p1')],
    )
    expect(rows.filter((r) => r.draft).length).toBe(2)
  })

  it('opens a draft problem as its own group under the service', () => {
    const rows = buildTool1Rows(
      [svc('s1')], [prob('p1', 's1')], [act('a1', 's1', 'p1')],
      [draft('d1', 'problem', 's1')],
    )
    const last = rows[rows.length - 1]
    expect(last.draft?.kind).toBe('problem')
    expect(last.problemId).toBe(null)
    expect(last.firstOfProblem).toBe(true)
    // The service's add still sits at the end of the service.
    expect(last.lastOfService).toBe(true)
  })

  it('draws nothing extra when there are no drafts', () => {
    const rows = buildTool1Rows([svc('s1')], [prob('p1', 's1')], [act('a1', 's1', 'p1')])
    expect(rows.every((r) => r.draft === null)).toBe(true)
    expect(rows).toHaveLength(1)
  })
})

describe('a service is written when it has a name, not when the button is pressed', () => {
  it('draws a draft service as a row of its own with nothing under it', () => {
    const rows = buildTool1Rows(
      [svc('s1')], [prob('p1', 's1')], [act('a1', 's1', 'p1')],
      [{ key: 'd9', kind: 'service' as const, serviceId: null, problemId: null }],
    )
    const last = rows[rows.length - 1]
    expect(last.draft?.kind).toBe('service')
    expect(last.serviceId).toBe(null)
    expect(last.firstOfService).toBe(true)
    // The real service is untouched above it.
    expect(rows[0].serviceId).toBe('s1')
  })

  it('leaves nothing behind when the draft is abandoned', () => {
    // Three presses, nothing typed: three rows on screen, no services anywhere.
    const drafts = ['d1', 'd2', 'd3'].map((key) => ({ key, kind: 'service' as const, serviceId: null, problemId: null }))
    const rows = buildTool1Rows([], [], [], drafts)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.draft && r.serviceId === null)).toBe(true)
  })
})
