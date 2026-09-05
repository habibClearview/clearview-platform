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

// ────────────────────────────────────────────────────────────
// IDLE TIMEOUT — 60 MINUTES, NOT 5.  2 September 2026.
//
// Five minutes was set as a security default without anybody using the app for
// an hour first. What it means in practice: read a long page, take a phone
// call, look at a second screen, and the app has signed you out when you look
// back. Habib hit it while working through the live site and described it as
// the webapp closing itself, which is exactly what it is.
//
// Five minutes is also not a meaningful security boundary — it is the same
// protection as sixty against the case this actually guards, which is a laptop
// left open and walked away from. What it reliably did instead was interrupt
// the person using it. Eleven password entries in five hours on 13 August is
// the same number telling the same story from the other side.
//
// Sixty minutes, and a warning two minutes before, so it is never a surprise
// and can always be waved away with a keystroke.
// ────────────────────────────────────────────────────────────
export const IDLE_MS = 60 * 60 * 1000 // 60 minutes

/** How long before the sign-out the warning appears. */
export const IDLE_WARNING_MS = 2 * 60 * 1000 // 2 minutes

/** True once the warning should be on screen, but before the sign-out itself. */
export function shouldWarnIdle(now: number, lastActivity: number, idleMs = IDLE_MS, warnMs = IDLE_WARNING_MS): boolean {
  const idleFor = now - lastActivity
  return idleFor >= idleMs - warnMs && idleFor < idleMs
}

/** Whole seconds left before the sign-out, for the countdown in the warning. */
export function secondsUntilSignOut(now: number, lastActivity: number, idleMs = IDLE_MS): number {
  return Math.max(0, Math.ceil((idleMs - (now - lastActivity)) / 1000))
}

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

/**
 * THE IDLE RULE HAS TO SURVIVE THE BROWSER BEING CLOSED. 4 September 2026.
 *
 * The sixty-minute timeout only ever applied while a tab was open. Every tab
 * stamped the activity clock to "now" the moment it mounted, so closing the
 * laptop on Friday and opening it on Monday produced a clock that said the user
 * had been active a second ago, and the sign-in page — which forwarded on the
 * mere presence of a session — sent them straight to the dashboard. Habib
 * reported exactly that: pressed Clearview sign in, landed on the dashboard,
 * never saw the password field.
 *
 * That is not somebody else getting in. The session lives in his own browser
 * and nothing about it was exposed. It is the app not applying its own rule:
 * it claims an hour of idle ends a session, and it meant an hour of idle
 * WITHIN one sitting.
 *
 * This is the decision both the sign-in page and the guard now ask before
 * trusting a stored session. A missing timestamp is a genuine first sign-in on
 * this browser and is never stale — only a timestamp that is present and old
 * counts.
 *
 * The stored value is written by this code but localStorage is writable by
 * anything else on the page, so a value that is not a sane, non-future number
 * is treated as missing rather than believed.
 */
/**
 * The activity clock, shared across tabs. It lives here rather than in the hook
 * because the sign-in page has to read the same key the guard writes — one key,
 * named once, is what keeps the two halves of the idle rule talking about the
 * same thing.
 */
export const LAST_ACTIVITY_KEY = 'cv:last-activity'

/**
 * SIGNING IN IS ACTIVITY. 5 September 2026.
 *
 * Shipped yesterday, and it locked Habib out of his own platform with a live
 * client on it. sessionIsStale reads a clock that a successful sign-in never
 * touched, so the sequence was: type the right password, land on the dashboard,
 * the guard mounts, reads a stamp from days ago, calls the session that is two
 * seconds old stale, and signs out. Back to the sign-in page, forever.
 *
 * The rule was right and the clock was wrong. Every path that establishes a
 * session stamps it here, before it navigates.
 */
export function markSignedIn(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
    }
  } catch { /* a browser refusing storage must not block a sign-in */ }
}

export function sessionIsStale(
  nowMs: number,
  storedLastActivity: string | number | null | undefined,
  idleMs = IDLE_MS,
): boolean {
  const v = Number(storedLastActivity)
  if (!storedLastActivity || !Number.isFinite(v) || v <= 0) return false
  // A clock that claims the future is a clock that cannot be reasoned about.
  if (v > nowMs) return false
  return nowMs - v >= idleMs
}

/**
 * WHERE YOU WERE WHEN THE SESSION ENDED. 14 August 2026.
 *
 * Being signed out mid-session already costs the password. It should not also
 * cost the four clicks back to the block, the zone and the service you were
 * working in — Habib named that as one of the most wearing parts of a day's
 * testing.
 *
 * Stored on the way out and consumed ONCE on the way back in, so a later visit
 * to the sign-in page opens the dashboard normally rather than a page from some
 * forgotten afternoon.
 *
 * Only same-origin paths are ever returned. A stored value is written by this
 * code, but localStorage is readable and writable by anything else running on
 * the page, so it is treated as untrusted: anything that is not a plain path
 * beginning with a single slash is discarded rather than followed. That refusal
 * is what stops a crafted value turning the sign-in form into an open redirect.
 */
export const RETURN_TO_KEY = 'cv:return-to'

export function isSafeReturnPath(path: string | null | undefined): boolean {
  if (!path) return false
  // A single leading slash, and no scheme or host. "//evil.com" and
  // "https://evil.com" are both rejected by the second character test.
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('\\')) return false
  return true
}

/** The landing page when there is nothing safe to go back to. */
export const DEFAULT_LANDING = '/coach'
