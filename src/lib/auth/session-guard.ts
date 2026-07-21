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
 * Pure idle decision: has it been at least `idleMs` since the last activity?
 * `lastActivityMs` is the newest activity timestamp seen across all tabs.
 * Defensive against a missing/blank timestamp (treated as "active now").
 */
export function isIdle(nowMs: number, lastActivityMs: number | null | undefined, idleMs: number): boolean {
  if (!lastActivityMs || !Number.isFinite(lastActivityMs)) return false
  return nowMs - lastActivityMs >= idleMs
}
