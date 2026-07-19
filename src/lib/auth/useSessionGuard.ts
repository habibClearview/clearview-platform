'use client'
// ============================================================
// useSessionGuard — wires the idle-timeout + heartbeat (see session-guard.ts)
// to the real browser: activity listeners, a timer, and a periodic server
// re-check. Only runs while `active` is true (i.e. there is a signed-in user),
// so it does nothing on the login page or the token-based field/intake pages.
// ============================================================
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ACTIVITY_EVENTS,
  HEARTBEAT_MS,
  IDLE_MS,
  shouldEndOnHeartbeat,
} from './session-guard'

export function useSessionGuard(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let ended = false

    async function endSession() {
      if (ended) return
      ended = true
      try {
        await supabase.auth.signOut()
      } catch {
        /* even if sign-out fails, still leave the authenticated area */
      }
      window.location.href = '/'
    }

    function resetIdle() {
      if (ended) return
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(endSession, IDLE_MS)
    }

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, resetIdle, { passive: true }),
    )
    resetIdle()

    heartbeat = setInterval(async () => {
      if (ended) return
      try {
        const { data, error } = await supabase.auth.getUser()
        if (shouldEndOnHeartbeat(data?.user ?? null, error)) endSession()
      } catch {
        /* network throw — ignore, try again next tick */
      }
    }, HEARTBEAT_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetIdle))
      if (idleTimer) clearTimeout(idleTimer)
      if (heartbeat) clearInterval(heartbeat)
    }
  }, [active])
}
