'use client'
// ============================================================
// useSessionGuard — idle-timeout + a safe revocation re-check, wired to the
// browser. Only runs while `active` is true (a signed-in user), so it does
// nothing on the login page or the token-based field/intake pages.
//
// This version fixes three faults in the first cut that signed people out
// while they were actively working:
//   1. CROSS-TAB ACTIVITY. Last-activity is stored in localStorage and shared
//      across tabs, so activity in ANY tab keeps EVERY tab alive. Previously
//      each tab had its own timer, so a background tab going idle for 5 minutes
//      signed the whole browser out while you were busy in another tab.
//   2. LOCAL SCOPE. The idle sign-out is scope:'local' — walking away from one
//      computer must not revoke your other devices. Previously it used the
//      default (global) scope and killed every session everywhere.
//   3. SAFE REVOCATION CHECK. The periodic check uses getSession() (which reads
//      and refreshes the local session) and only signs out when the session is
//      genuinely gone. Previously it used getUser(), which briefly 401s during
//      a normal token refresh and caused false sign-outs.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ACTIVITY_EVENTS, HEARTBEAT_MS, IDLE_MS, LAST_ACTIVITY_KEY,
  sessionIsStale, RETURN_TO_KEY, isIdle, isSafeReturnPath, screenRunsUnattended, shouldWarnIdle, secondsUntilSignOut } from './session-guard'

export function useSessionGuard(active: boolean) {
  // NEVER A SURPRISE. 2 September 2026. The sign-out used to happen with no
  // warning at all, so from the outside the app simply closed itself. Now it
  // says so first, counts down, and any key or click cancels it.
  const [warnSeconds, setWarnSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    let ended = false
    let timer: ReturnType<typeof setInterval> | null = null

    // A screen meant to be left running does not time itself out. Read once,
    // here, because this tab does not change what it is while it is open.
    const unattended = screenRunsUnattended(window.location.pathname)

    function markActivity() {
      if (ended) return
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())) } catch { /* ignore */ }
    }

    function readStoredActivity(): string | null {
      try { return localStorage.getItem(LAST_ACTIVITY_KEY) } catch { return null }
    }

    function lastActivity(): number {
      try {
        const v = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
        return Number.isFinite(v) && v > 0 ? v : Date.now()
      } catch {
        return Date.now()
      }
    }

    async function endSession() {
      if (ended) return
      ended = true
      // Remember the page, so signing back in returns here instead of the
      // dashboard. Written before the sign-out, because the redirect follows
      // immediately and there is no second chance.
      try {
        const here = window.location.pathname + window.location.search
        if (isSafeReturnPath(here) && here !== '/') localStorage.setItem(RETURN_TO_KEY, here)
      } catch { /* a browser refusing storage is not a reason to stay signed in */ }
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch { /* even if sign-out fails, still leave the authenticated area */ }
      window.location.href = '/'
    }

    // A tab that has just mounted is not evidence that anybody was here. Seeding
    // the clock unconditionally is what made the idle rule stop at the edge of a
    // browsing session: close the browser for a weekend, open it, and the stamp
    // said "active now". So look at what is stored FIRST, and if it is older
    // than the idle window, end the session here rather than adopt it.
    if (!unattended && sessionIsStale(Date.now(), readStoredActivity())) {
      endSession()
      return () => {
        ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActivity))
        if (timer) clearInterval(timer)
      }
    }
    // Past that, a freshly-loaded tab should not look instantly idle.
    markActivity()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }))

    timer = setInterval(async () => {
      if (ended) return
      // 1) Idle timeout, measured across ALL tabs. Skipped on a screen that is
      //    meant to be left alone — see UNATTENDED_SCREENS for what that covers
      //    and, just as importantly, what it does not.
      if (!unattended && isIdle(Date.now(), lastActivity(), IDLE_MS)) { endSession(); return }
      // The warning, before anything happens. Touching the screen clears it,
      // because that same touch resets the idle clock.
      if (!unattended && shouldWarnIdle(Date.now(), lastActivity(), IDLE_MS)) {
        setWarnSeconds(secondsUntilSignOut(Date.now(), lastActivity(), IDLE_MS))
      } else {
        setWarnSeconds((prev) => (prev === null ? prev : null))
      }
      // 2) Revocation check — only ends the session when it's genuinely gone
      //    (a merely-expired-but-refreshable token does NOT count).
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) endSession()
      } catch { /* transient — try again next tick */ }
    }, HEARTBEAT_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActivity))
      if (timer) clearInterval(timer)
    }
  }, [active])

  return warnSeconds
}
