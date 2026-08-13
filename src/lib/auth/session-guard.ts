// ============================================================
// Session guard — the pure, testable pieces behind the idle-timeout + safe
// revocation re-check that useSessionGuard() wires to the browser.
//
// Two protections for a signed-in user:
//   1. IDLE TIMEOUT — after IDLE_MS with no interaction ACROSS ANY TAB, sign out
//      (local scope). Protects an unattended screen without touching the user's
//      other devices.
//   2. REVOCATION RE-CHECK — periodically confirm the session still exists; if
//      it's genuinely gone (signed out elsewhere, admin force-signout), drop it.
// ============================================================

// Idle timeout. Kept deliberately short for a platform showing real financial
// data. Change this one number to make it shorter/longer.
export const IDLE_MS = 5 * 60 * 1000 // 5 minutes

// How often the guard re-checks idle + session state.
export const HEARTBEAT_MS = 15 * 1000 // 15 seconds

// The browser events that count as "the user is still here" and reset the idle
// timer.
export const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const

/**
 * SCREENS THAT ARE MEANT TO BE LEFT ALONE. 13 August 2026.
 *
 * The projected view exists to sit on a wall while a room works. Nobody touches
 * the laptop it came from — that is the point of it — so it collects none of the
 * events above and signs itself out after five minutes, mid session, every
 * time. Habib logged in with his password ELEVEN times in five hours on 13
 * August, with not one token refresh in between, which is what that looks like
 * from the outside.
 *
 * It is exempt from the IDLE timeout and from nothing else. The revocation
 * re-check still runs, so signing out elsewhere or an admin force-signout still
 * closes it. And it is the only screen listed: the block page, the dashboard and
 * everything showing sales, costs or profit keep the five minutes, because an
 * unattended screen with money on it is what that rule is for.
 *
 * WHAT THIS DOES NOT FIX, and it must not be claimed to. The projection is
 * opened from the block with window.open, so both tabs share one browser
 * session. This stops the PROJECTION ending the session. If the block tab is
 * itself left untouched for five minutes it still signs out, and the projection
 * goes with it, because there is one session behind both. Covering that means
 * exempting the block page while a question is open, which is a separate
 * decision and is not taken here.
 */
export const UNATTENDED_SCREENS = ['/coach/facilitate'] as const

/** Is this path a screen that is meant to be left running unattended? */
export function screenRunsUnattended(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return UNATTENDED_SCREENS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Pure idle decision: has it been at least `idleMs` since the last activity?
 * `lastActivityMs` is the newest activity timestamp seen across all tabs.
 * Defensive against a missing/blank timestamp (treated as "active now").
 */
export function isIdle(nowMs: number, lastActivityMs: number | null | undefined, idleMs: number): boolean {
  if (!lastActivityMs || !Number.isFinite(lastActivityMs)) return false
  return nowMs - lastActivityMs >= idleMs
}
