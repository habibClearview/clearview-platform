// ============================================================
// Session guard — the pure, testable decision logic behind the
// idle-timeout + heartbeat that useSessionGuard() wires to the DOM.
//
// Two protections for a signed-in user:
//   1. IDLE TIMEOUT — after IDLE_MS with no interaction, sign out. Protects an
//      unattended screen (someone walks away from an open financials view).
//   2. HEARTBEAT — every HEARTBEAT_MS, re-validate the session against the
//      server. If it was revoked (e.g. an admin forced sign-out, or the person
//      signed out on another device), drop this session promptly instead of
//      waiting for the access token to expire on its own.
// ============================================================

// Idle timeout. Kept deliberately short for a platform showing real financial
// data. Change this one number to make it shorter/longer.
export const IDLE_MS = 5 * 60 * 1000 // 5 minutes

// How often the heartbeat re-checks the session server-side.
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
 * Decide whether a heartbeat result means the session should be ended.
 *
 * Only two things end a session here:
 *   - the server says there is no user AND returned no error (the session is
 *     genuinely gone), or
 *   - the server returned an auth error (401/403 — token revoked or expired).
 *
 * A transient/network error (no status, or a 5xx) must NOT sign the user out —
 * otherwise a momentary connection blip would kick them out mid-work. Those are
 * ignored so the next heartbeat can try again.
 */
export function shouldEndOnHeartbeat(
  user: unknown,
  error: { status?: number } | null | undefined,
): boolean {
  if (!error) return !user // no error → end only if there is genuinely no user
  const status = error.status
  return status === 401 || status === 403
}
