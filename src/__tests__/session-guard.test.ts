import { describe, it, expect } from 'vitest'
import { shouldEndOnHeartbeat, IDLE_MS, HEARTBEAT_MS } from '@/lib/auth/session-guard'

describe('shouldEndOnHeartbeat', () => {
  it('ends the session when there is no user and no error (session genuinely gone)', () => {
    expect(shouldEndOnHeartbeat(null, null)).toBe(true)
    expect(shouldEndOnHeartbeat(undefined, undefined)).toBe(true)
  })

  it('does NOT end on "no user / no error" until a live session has been seen', () => {
    // First tick right after login: hasBeenLive=false → must not sign out.
    expect(shouldEndOnHeartbeat(null, null, false)).toBe(false)
    // After a live session was confirmed once, a later "no user" ends it.
    expect(shouldEndOnHeartbeat(null, null, true)).toBe(true)
    // A revoked token still ends immediately, even before any live tick.
    expect(shouldEndOnHeartbeat(null, { status: 401 }, false)).toBe(true)
  })

  it('keeps the session when a valid user is returned', () => {
    expect(shouldEndOnHeartbeat({ id: 'u1' }, null)).toBe(false)
  })

  it('ends the session on an auth error (401/403 — revoked or expired)', () => {
    expect(shouldEndOnHeartbeat(null, { status: 401 })).toBe(true)
    expect(shouldEndOnHeartbeat({ id: 'u1' }, { status: 403 })).toBe(true)
  })

  it('does NOT end the session on a transient/network error (no auth status)', () => {
    expect(shouldEndOnHeartbeat(null, {})).toBe(false)
    expect(shouldEndOnHeartbeat(null, { status: 500 })).toBe(false)
    expect(shouldEndOnHeartbeat(null, { status: 0 })).toBe(false)
    expect(shouldEndOnHeartbeat({ id: 'u1' }, { status: 503 })).toBe(false)
  })

  it('uses a short idle window and a frequent heartbeat', () => {
    expect(IDLE_MS).toBeLessThanOrEqual(5 * 60 * 1000)
    expect(HEARTBEAT_MS).toBeLessThanOrEqual(30 * 1000)
  })
})
