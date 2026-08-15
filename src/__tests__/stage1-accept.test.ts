// ============================================================
// ACCEPT FILLS THE ROW THE ANSWER IS ABOUT.
//
// The failure this is written against, in Habib's words: answer all six of
// Tool 1's questions and you get six rows, each with one cell filled.
//
// So the test that matters is the WHOLE SIX, walked in order, ending in one
// problem, one activity under it, and four answers ON that activity.
// ============================================================
import { describe, expect, it } from 'vitest'
import { chooserFor, isRefusal, planAccept, type RoomAnchor } from '@/lib/stage1-accept'

const PHASE0 = 'gtcv_assumptions'
const nothing: RoomAnchor = { serviceId: null, problemId: null, activityId: null }

describe('where an accepted answer goes', () => {
  it('walks Tool 1\'s six questions into ONE problem and ONE activity', () => {
    // The room is anchored to a service, which is the one link that is always
    // there before a question is opened.
    let anchor: RoomAnchor = { serviceId: 'svc', problemId: null, activityId: null }

    // 1. What problem does this service solve? -> a new problem under it.
    const one = planAccept(['problem'], anchor, PHASE0)
    expect(isRefusal(one)).toBe(false)
    if (isRefusal(one)) return
    expect(one.mode).toBe('createProblem')
    expect(one.serviceId).toBe('svc')
    anchor = { ...anchor, problemId: 'prob' }

    // 2. Name one activity that solves that problem. -> a new activity, filed
    //    under the problem just accepted, never floating.
    const two = planAccept(['activity'], anchor, PHASE0)
    if (isRefusal(two)) throw new Error(two.refusal)
    expect(two.mode).toBe('createActivity')
    expect(two.problemId).toBe('prob')
    anchor = { ...anchor, activityId: 'act' }

    // 3 to 6. All four FILL that activity. Not one of them makes a row.
    for (const column of ['delivers', 'who_pays', 'assumption', 'disproof']) {
      const step = planAccept([column], anchor, PHASE0)
      if (isRefusal(step)) throw new Error(step.refusal)
      expect(step.mode).toBe('fillActivityValue')
      expect(step.rowId).toBe('act')
      expect(step.field).toBe(column)
    }
  })

  it('refuses, rather than inventing a row, when the chain is not there yet', () => {
    // This is the whole of the old fault: with nowhere to put it, accept used
    // to make a row and put it there alone.
    const orphan = planAccept(['delivers'], { serviceId: 'svc', problemId: null, activityId: null }, PHASE0)
    expect(isRefusal(orphan)).toBe(true)

    const noProblem = planAccept(['activity'], { serviceId: 'svc', problemId: null, activityId: null }, PHASE0)
    expect(isRefusal(noProblem)).toBe(true)

    const noService = planAccept(['problem'], nothing, PHASE0)
    expect(isRefusal(noService)).toBe(true)
  })

  it('a refusal says which press is missing', () => {
    const d = planAccept(['who_pays'], { serviceId: 'svc', problemId: 'prob', activityId: null }, PHASE0)
    if (!isRefusal(d)) throw new Error('should have refused')
    expect(d.refusal).toMatch(/activity/i)
  })

  it('sends the answer where the facilitator pointed it, not where the room is', () => {
    // The room named three activities; this "who pays" is about the second.
    const d = planAccept(['who_pays'], { serviceId: 'svc', problemId: 'prob', activityId: 'first' }, PHASE0, 'second')
    if (isRefusal(d)) throw new Error(d.refusal)
    expect(d.rowId).toBe('second')
  })

  it('fills a problem for Tool 2\'s five, and never restates the problem', () => {
    const anchor: RoomAnchor = { serviceId: 'svc', problemId: 'prob', activityId: 'act' }
    for (const column of [
      'experienced_by', 'accountable', 'budget_holder', 'cost_of_not_solving', 'budget_mechanism',
    ]) {
      const d = planAccept([column], anchor, PHASE0)
      if (isRefusal(d)) throw new Error(d.refusal)
      expect(d.mode).toBe('fillProblemColumn')
      expect(d.table).toBe('gtcv_problem_owner_budget')
      expect(d.rowId).toBe('prob')
    }
  })

  it('leaves every other block exactly as it was', () => {
    // DP01 names services. Its answers are rows of its own table, and this
    // change must not have touched that.
    const d = planAccept(['service_name', 'what_it_delivers'], nothing, 'gtcv_service_inventory')
    if (isRefusal(d)) throw new Error(d.refusal)
    expect(d.mode).toBe('createRow')
    expect(d.table).toBe('gtcv_service_inventory')
  })

  it('offers the right list to choose from beside each answer', () => {
    expect(chooserFor(['delivers'])).toBe('activity')
    expect(chooserFor(['activity'])).toBe('problem')
    expect(chooserFor(['budget_holder'])).toBe('problem')
    // Nothing to choose: the problem is named under the anchored service.
    expect(chooserFor(['problem'])).toBe(null)
    expect(chooserFor(['service_name'])).toBe(null)
  })
})
