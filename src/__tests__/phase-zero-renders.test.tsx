// @vitest-environment jsdom
// ============================================================
// THE WORKSPACE RENDERS AT ALL.
//
// This exists because the same crash has now taken the whole Phase 0 screen
// down twice, and neither tsc, nor the hooks lint, nor the build caught it
// either time:
//
//   a useCallback whose dependency list names a const declared FURTHER DOWN
//   the component. Dependency arrays are evaluated during render, so the
//   reference hits the temporal dead zone, throws ReferenceError on the first
//   render, and the error boundary shows "This section couldn't load".
//
// It is a runtime fault in code that type-checks and builds perfectly, so the
// only thing that finds it is rendering the component. That is all this does.
// If it fails, read the error: it names the const that is in the wrong place.
// ============================================================
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'

// The workspace talks to Supabase and to /api/services on mount. Neither is
// what is being tested, so both are stubbed to the shape the component reads.
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self, eq: self, order: self, insert: self, update: self, delete: self,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  })
  return { supabase: { from: () => chain, auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } }
})

vi.mock('@/lib/authed-fetch', () => ({
  authedFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
}))

import PhaseZeroWorkspace from '@/components/gtcv/PhaseZeroWorkspace'

describe('the Phase 0 workspace renders', () => {
  it('does not throw on the first render, with manage rights', () => {
    expect(() => renderToString(
      React.createElement(PhaseZeroWorkspace, { clientId: 'client_test', canManage: true }),
    )).not.toThrow()
  })

  it('does not throw read-only either', () => {
    expect(() => renderToString(
      React.createElement(PhaseZeroWorkspace, { clientId: 'client_test', canManage: false }),
    )).not.toThrow()
  })
})
