// @vitest-environment jsdom
// ============================================================
// THE COACH DASHBOARD COMES UP ON A DEEP ADDRESS.
//
// /coach?client=...&zone=phase0 is what the address bar holds once the block is
// in the URL, and it is also what a sign-in returns to. If the page throws on
// that address there is no error boundary above it: Next shows "Application
// error: a client-side exception has occurred" and the whole screen is white.
// ============================================================
import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'

vi.mock('@/lib/supabase', () => {
  // A real query object is a thenable that also chains, so the stub has to be
  // both — .then() must hand back something with a .catch() on it.
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self, eq: self, order: self, in: self, is: self, not: self, limit: self,
    insert: self, update: self, delete: self, upsert: self,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).catch(fn),
  })
  return {
    supabase: {
      from: () => chain,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  }
})
vi.mock('@/lib/authed-fetch', () => ({
  authedFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
}))

import CoachDashboard from '@/components/coach/CoachDashboard'

describe('the coach dashboard on a deep address', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  async function open(url: string) {
    window.history.replaceState(null, '', url)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let thrown: unknown = null
    // A render error surfaces here; one thrown inside an effect surfaces on the
    // flush below, which is where the white screen came from.
    await act(async () => {
      try { root.render(React.createElement(CoachDashboard, { onSignOut() {} })) }
      catch (e) { thrown = e }
    })
    try { await act(async () => { await Promise.resolve() }) } catch (e) { thrown = thrown || e }
    try { await act(async () => { root.unmount() }) } catch { /* already down */ }
    host.remove()
    return thrown
  }

  it('comes up with a client and a zone in the query', async () => {
    expect(await open('/coach?client=client_1786340570857&zone=phase0')).toBe(null)
  })

  it('comes up on every zone the sidebar can send it to', async () => {
    // Whatever was open when the session timed out is what comes back in the
    // address, so every one of these is a real landing page.
    for (const zone of ['cover', 'phase0', 'journey', 'sessions', 'dp01', 'dp04', 'tracker']) {
      expect(await open(`/coach?client=client_1786340570857&zone=${zone}`), zone).toBe(null)
    }
  })

  it('comes up with no query at all, and with a client but no zone', async () => {
    expect(await open('/coach')).toBe(null)
    expect(await open('/coach?client=client_1786340570857')).toBe(null)
  })

  it('comes up on an address naming an engagement that is not there', async () => {
    // A bookmarked address for a deleted engagement must not white-screen.
    expect(await open('/coach?client=client_gone&zone=phase0')).toBe(null)
  })
})
