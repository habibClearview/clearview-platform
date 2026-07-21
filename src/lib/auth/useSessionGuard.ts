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
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ACTIVITY_EVENTS, HEARTBEAT_MS, IDLE_MS, isIdle } from './session-guard'

const LAST_ACTIVITY_KEY = 'cv:last-activity'

export function useSessionGuard(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    let ended = false
    let timer: ReturnType<typeof setInterval> | null = null

    function markActivity() {
      if (ended) return
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())) } catch { /* ignore */ }
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
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch { /* even if sign-out fails, still leave the authenticated area */ }
      window.location.href = '/'
    }

    // Seed activity immediately so a freshly-loaded tab never looks instantly idle.
    markActivity()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }))

    timer = setInterval(async () => {
      if (ended) return
      // 1) Idle timeout, measured across ALL tabs.
      if (isIdle(Date.now(), lastActivity(), IDLE_MS)) { endSession(); return }
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
}
