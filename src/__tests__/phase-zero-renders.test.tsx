// @vitest-environment jsdom
// ============================================================
// THE WORKSPACE RENDERS — INCLUDING THE TABLE, WITH ROWS IN IT.
//
// This exists because the same shape of crash took the whole Phase 0 screen
// down twice in one day, and neither tsc, nor the build, nor the first version
// of this file caught either one:
//
//   1. a useCallback whose dependency list named a const declared further down
//      the component, so the reference hit the temporal dead zone
//   2. a handler deleted by an over-broad edit while the JSX calling it stayed,
//      in a file carrying @ts-nocheck where the compiler checks nothing
//
// The first version of this test rendered with NO data, so the table never
// drew and neither fault was on the path it covered. It renders with rows now:
// three services, problems under them, activities under those, values on an
// activity, and a draft of each kind — which is every branch the table has.
//
// It asserts one thing, deliberately: that the screen comes up. It does not
// know whether any button does the right thing. Only Habib's phone knows that.
// ============================================================
import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

// ── What the engagement holds, in the shape the component reads ──
const SERVICES = [
  { id: 'svc-1', service_name: 'Training', sort_order: 0, parked_at: null, service_state: 'current', decision: null },
  { id: 'svc-2', service_name: 'Gender Workshop', sort_order: 1, parked_at: null, service_state: 'current', decision: null },
  // A parked service, which the table must leave out without falling over.
  { id: 'svc-3', service_name: 'Old thing', sort_order: 2, parked_at: '2026-08-14T09:00:00Z', service_state: 'current', decision: null },
]
const PROBLEMS = [
  { id: 'p-1', service_id: 'svc-1', activity_id: null, problem: 'Knowledge of gender in supply chain', parked_at: null, decision: null, sort_order: 0, budget_holder: null },
  // A problem nothing solves yet — the row that did not exist before 15 August.
  { id: 'p-2', service_id: 'svc-1', activity_id: null, problem: 'Nobody has costed it', parked_at: null, decision: null, sort_order: 1, budget_holder: 'Finance' },
  { id: 'p-3', service_id: 'svc-2', activity_id: null, problem: 'Facilitators leave', parked_at: null, decision: null, sort_order: 0, budget_holder: null },
]
const ACTIVITIES = [
  { id: 'a-1', service_id: 'svc-1', problem_id: 'p-1', activity: 'Renting a room', delivers: 'Skill', who_pays: null, assumption: null, disproof: null, parked_at: null, sort_order: 0, service_name: 'Training' },
  { id: 'a-2', service_id: 'svc-1', problem_id: 'p-1', activity: 'Searching for facilitator', delivers: null, who_pays: 'The client', assumption: null, disproof: null, parked_at: null, sort_order: 1, service_name: 'Training' },
  // Stated before anybody named the problem: drawn in a group of its own.
  { id: 'a-3', service_id: 'svc-2', problem_id: null, activity: 'Curriculum tailoring', delivers: null, who_pays: null, assumption: null, disproof: null, parked_at: null, sort_order: 0, service_name: 'Gender Workshop' },
  // No service at all, and completely blank — one is drawn, one is not.
  { id: 'a-4', service_id: null, problem_id: null, activity: 'Presentation at client board', delivers: null, who_pays: null, assumption: null, disproof: null, parked_at: null, sort_order: 0, service_name: null },
  { id: 'a-5', service_id: 'svc-1', problem_id: 'p-1', activity: null, delivers: null, who_pays: null, assumption: null, disproof: null, parked_at: null, sort_order: 2, service_name: 'Training' },
]
const VALUES = [
  { id: 'v-1', activity_id: 'a-1', field: 'delivers', value: 'Skill', sort_order: 0 },
  { id: 'v-2', activity_id: 'a-1', field: 'delivers', value: 'Curriculum', sort_order: 1 },
]

const TABLES: Record<string, unknown[]> = {
  gtcv_assumptions: ACTIVITIES,
  gtcv_problem_owner_budget: PROBLEMS,
  gtcv_hypotheses_shortlist: [{ id: 'h-1', service_id: 'svc-1', hypothesis: 'They will pay', urgency: 4, ownership_clarity: 3, willingness_to_pay: 2, access: 5, advances: false, parked_at: null, sort_order: 0 }],
  gtcv_signal_story: [{ id: 's-1', service_id: 'svc-1', classification: 'signal', statement: 'One buyer asked twice', parked_at: null, sort_order: 0 }],
  gtcv_continue_pause_kill: [{ id: 'd-1', service_id: 'svc-1', decision: 'continue', rationale: 'Two buyers', destination_dp: 'dp02', parked_at: null, sort_order: 0 }],
  gtcv_service_inventory: SERVICES,
}

vi.mock('@/lib/supabase', () => {
  const make = (table: string) => {
    const result = { data: TABLES[table] ?? [], error: null }
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: self, eq: self, order: self, in: self, is: self, not: self,
      insert: self, update: self, delete: self, upsert: self, limit: self,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(result),
    })
    return chain
  }
  return {
    supabase: {
      from: (table: string) => make(table),
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  }
})

vi.mock('@/lib/authed-fetch', () => ({
  authedFetch: (url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(
      url.includes('/api/services')
        ? {
          services: SERVICES,
          activities: ACTIVITIES,
          problems: PROBLEMS,
          activityValues: VALUES,
          hypothesisSources: [],
          currentServiceId: 'svc-1',
        }
        : { questions: [], pending: [], blockRows: [], chain: null, state: null },
    ),
  }),
}))

import PhaseZeroWorkspace from '@/components/gtcv/PhaseZeroWorkspace'

async function draw(props: { clientId: string; canManage: boolean }) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  // Errors thrown in render surface here rather than being swallowed.
  await act(async () => {
    root.render(React.createElement(PhaseZeroWorkspace, props))
  })
  // Let the reads that fill the tables settle, then draw again with them.
  await act(async () => { await Promise.resolve() })
  const html = host.innerHTML
  await act(async () => { root.unmount() })
  host.remove()
  return html
}

describe('the Phase 0 workspace renders', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('comes up with an engagement full of rows', async () => {
    const html = await draw({ clientId: 'client_test', canManage: true })
    // The rows are actually on the screen, so the table's own branches ran.
    expect(html).toContain('Knowledge of gender in supply chain')
    expect(html).toContain('Renting a room')
    // A problem nothing solves yet still has its row.
    expect(html).toContain('Nobody has costed it')
    // The second service, and the activity stated before its problem.
    expect(html).toContain('Curriculum tailoring')
  })

  it('comes up read only', async () => {
    const html = await draw({ clientId: 'client_test', canManage: false })
    expect(html).toContain('Knowledge of gender in supply chain')
  })

  it('comes up on an engagement with nothing in it', async () => {
    // The first minute of a new engagement, which is its own set of branches.
    const empty = await (async () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)
      await act(async () => { root.render(React.createElement(PhaseZeroWorkspace, { clientId: '', canManage: true })) })
      const html = host.innerHTML
      await act(async () => { root.unmount() })
      return html
    })()
    expect(empty).toContain('Select an engagement')
  })
})
