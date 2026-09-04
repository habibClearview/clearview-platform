import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { isIdle, IDLE_MS, sessionIsStale, HEARTBEAT_MS, screenRunsUnattended, isSafeReturnPath, shouldWarnIdle, secondsUntilSignOut } from '@/lib/auth/session-guard'

describe('isIdle', () => {
  const now = 1_000_000_000_000

  it('is NOT idle right after activity', () => {
    expect(isIdle(now, now, IDLE_MS)).toBe(false)
    expect(isIdle(now, now - 1000, IDLE_MS)).toBe(false)
  })

  it('is idle once the gap reaches the timeout', () => {
    expect(isIdle(now, now - IDLE_MS, IDLE_MS)).toBe(true)
    expect(isIdle(now, now - (IDLE_MS + 1), IDLE_MS)).toBe(true)
  })

  it('is NOT idle just before the timeout', () => {
    expect(isIdle(now, now - (IDLE_MS - 1), IDLE_MS)).toBe(false)
  })

  it('treats a missing/blank last-activity as active (never signs out on bad data)', () => {
    expect(isIdle(now, null, IDLE_MS)).toBe(false)
    expect(isIdle(now, undefined, IDLE_MS)).toBe(false)
    expect(isIdle(now, NaN, IDLE_MS)).toBe(false)
    expect(isIdle(now, 0, IDLE_MS)).toBe(false)
  })

  // 2 September 2026. This asserted five minutes or less, which was the
  // original policy. Five minutes signed Habib out while he was reading the
  // live site — from outside it looks like the app closing itself. The window
  // is an hour now, still bounded so it cannot quietly drift to "never", and
  // the sign-out is warned about before it happens.
  it('uses an idle window a person can work inside, and still has one', () => {
    expect(IDLE_MS).toBeGreaterThanOrEqual(30 * 60 * 1000)
    expect(IDLE_MS).toBeLessThanOrEqual(2 * 60 * 60 * 1000)
    expect(HEARTBEAT_MS).toBeLessThanOrEqual(30 * 1000)
  })

  it('warns before it signs anybody out, and never after', () => {
    const last = now - IDLE_MS + 60 * 1000        // one minute left
    expect(shouldWarnIdle(now, last)).toBe(true)
    expect(isIdle(now, last, IDLE_MS)).toBe(false)
    expect(secondsUntilSignOut(now, last)).toBe(60)

    const fresh = now - 1000                       // just used it
    expect(shouldWarnIdle(now, fresh)).toBe(false)

    const gone = now - IDLE_MS - 1000              // already past it
    expect(shouldWarnIdle(now, gone)).toBe(false)
    expect(isIdle(now, gone, IDLE_MS)).toBe(true)
  })
})

describe('screenRunsUnattended', () => {
  it('exempts the projected view, which is meant to sit on a wall untouched', () => {
    expect(screenRunsUnattended('/coach/facilitate')).toBe(true)
  })

  it('exempts it with a query string or a trailing segment, as it is actually opened', () => {
    // window.location.pathname carries no query string, but the route is opened
    // as /coach/facilitate?clientId=...&gateId=... and must not stop matching if
    // that ever changes.
    expect(screenRunsUnattended('/coach/facilitate/')).toBe(true)
  })

  it('does NOT exempt the block page or anything showing money', () => {
    // The whole point of keeping the list short: an unattended screen with
    // sales, costs and profit on it is what the five minutes is for.
    expect(screenRunsUnattended('/coach')).toBe(false)
    expect(screenRunsUnattended('/coach/dashboard')).toBe(false)
    expect(screenRunsUnattended('/')).toBe(false)
  })

  it('does not exempt a path that merely starts with the same letters', () => {
    expect(screenRunsUnattended('/coach/facilitate-settings')).toBe(false)
  })

  it('treats a missing path as attended, so a doubt never removes the timeout', () => {
    expect(screenRunsUnattended(null)).toBe(false)
    expect(screenRunsUnattended(undefined)).toBe(false)
    expect(screenRunsUnattended('')).toBe(false)
  })
})

describe('isSafeReturnPath', () => {
  it('accepts an ordinary same-origin path, with or without a query', () => {
    expect(isSafeReturnPath('/coach')).toBe(true)
    expect(isSafeReturnPath('/coach/facilitate?clientId=abc&gateId=phase_0')).toBe(true)
  })

  it('refuses anything that could leave this site', () => {
    // The whole point of the check: a stored value is not trusted just because
    // this code normally writes it.
    expect(isSafeReturnPath('//evil.example')).toBe(false)
    expect(isSafeReturnPath('https://evil.example')).toBe(false)
    expect(isSafeReturnPath('http://evil.example')).toBe(false)
    expect(isSafeReturnPath('/\\evil.example')).toBe(false)
    expect(isSafeReturnPath('coach')).toBe(false)
  })

  it('refuses nothing at all, so the default landing is used', () => {
    expect(isSafeReturnPath(null)).toBe(false)
    expect(isSafeReturnPath(undefined)).toBe(false)
    expect(isSafeReturnPath('')).toBe(false)
  })
})

// ============================================================
// THE IDLE RULE ACROSS A CLOSED BROWSER. 4 September 2026.
// The timeout used to stop at the edge of a browsing session, because every
// tab stamped the clock to "now" as it mounted and the sign-in page forwarded
// on the mere presence of a session. Habib pressed Clearview sign in after a
// gap and landed on the dashboard without ever seeing the password field.
// ============================================================
describe('sessionIsStale', () => {
  const NOW = 1_800_000_000_000

  it('is stale once the idle window has passed with the app closed', () => {
    expect(sessionIsStale(NOW, String(NOW - IDLE_MS - 1))).toBe(true)
    expect(sessionIsStale(NOW, String(NOW - IDLE_MS))).toBe(true)
  })

  it('is not stale inside the window', () => {
    expect(sessionIsStale(NOW, String(NOW - IDLE_MS + 1000))).toBe(false)
    expect(sessionIsStale(NOW, String(NOW))).toBe(false)
  })

  it('treats a first sign-in on this browser as not stale', () => {
    // No stamp has ever been written. Signing that person out would lock out
    // everybody signing in for the first time.
    for (const v of [null, undefined, '', '0']) expect(sessionIsStale(NOW, v)).toBe(false)
  })

  it('does not believe a value it cannot reason about', () => {
    // localStorage is writable by anything on the page, and a clock claiming
    // the future cannot be measured against. Neither ends a session.
    for (const v of ['tomorrow', 'NaN', String(NOW + 60_000)]) {
      expect(sessionIsStale(NOW, v)).toBe(false)
    }
  })

  it('uses the same hour the rest of the guard uses', () => {
    expect(IDLE_MS).toBe(60 * 60 * 1000)
  })
})

describe('the two places the rule has to hold', () => {
  it('the sign-in page checks staleness before forwarding', () => {
    const page = fs.readFileSync('app/page.tsx', 'utf8')
    expect(page).toContain('sessionIsStale')
    // and signs the stale session out rather than merely showing the form
    expect(page).toMatch(/sessionIsStale[\s\S]{0,400}signOut/)
  })

  it('the guard judges the stored clock before overwriting it', () => {
    const hook = fs.readFileSync('src/lib/auth/useSessionGuard.ts', 'utf8')
    const staleAt = hook.indexOf('sessionIsStale')
    const seedAt = hook.indexOf('markActivity()\n    ACTIVITY_EVENTS')
    expect(staleAt).toBeGreaterThan(-1)
    expect(seedAt).toBeGreaterThan(-1)
    expect(staleAt).toBeLessThan(seedAt)
  })

  it('both halves read one key', () => {
    const shared = fs.readFileSync('src/lib/auth/session-guard.ts', 'utf8')
    expect(shared).toContain("LAST_ACTIVITY_KEY = 'cv:last-activity'")
    expect(fs.readFileSync('src/lib/auth/useSessionGuard.ts', 'utf8'))
      .not.toContain("const LAST_ACTIVITY_KEY =")
  })
})
