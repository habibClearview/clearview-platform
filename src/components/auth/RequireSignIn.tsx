'use client'
// ============================================================
// A CLIENT-FACING PAGE HAS TO KNOW WHO IS LOOKING
//
// /engagement/[slug] and /engagement/[slug]/charter had no session check of
// any kind. Signed out, they rendered their own shell to anybody: headings,
// the path, the nine blocks, and no data, because the data is fetched in the
// browser and row-level security returned nothing. No client information
// leaked, and that is the only good part of it.
//
// What it looked like to the person holding it was a brochure. Habib sent the
// first letters of a real engagement, a recipient's sign-in link had expired,
// and they landed on a page about a journey with nothing on it and nowhere to
// sign in.
//
// One guard, used by both, so the next client-facing page added cannot forget.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RETURN_TO_KEY, isSafeReturnPath } from '@/lib/auth/session-guard'

export default function RequireSignIn({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    // A LINK THAT FAILED MUST NOT BE REDIRECTED AWAY FROM. 8 September 2026.
    //
    // Supabase reports a spent or expired link by returning to this address
    // with #error=... on the end. Sending that visitor to the sign-in page
    // throws the fragment away, and with it the only explanation they were
    // ever going to get: they arrive at a bare password box having been given
    // no reason, which is worse than the brochure this guard replaced.
    //
    // So when the address carries an auth error, this guard stands aside and
    // lets LinkProblem, in the root layout, explain it and offer a new link.
    // Habib's recipients are holding those links now.
    try {
      const hash = window.location.hash.replace(/^#/, '')
      if (hash) {
        const p = new URLSearchParams(hash)
        if (p.get('error') || p.get('error_code')) return
      }
    } catch { /* unreadable address, fall through to the normal check */ }
    // A slow auth check must not hold the page open indefinitely. If it cannot
    // answer, the safe answer is to ask them to sign in.
    const timer = setTimeout(() => { if (!cancelled) toSignIn() }, 6000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      clearTimeout(timer)
      if (session) { setReady(true); return }
      toSignIn()
    }).catch(() => { if (!cancelled) { clearTimeout(timer); toSignIn() } })

    return () => { cancelled = true; clearTimeout(timer) }

    function toSignIn() {
      try {
        // Back here once they are in, rather than dropped on a dashboard and
        // left to find their own engagement again.
        const here = window.location.pathname + window.location.search
        if (isSafeReturnPath(here)) localStorage.setItem(RETURN_TO_KEY, here)
      } catch { /* storage refused; signing in still works */ }
      window.location.href = '/'
    }
  }, [])

  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F5F0E8', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--cv-font)',
        color: '#1B2A41', padding: '1.5rem', textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: '0.78rem', letterSpacing: '0.15em', color: '#00767A', marginBottom: '0.6rem' }}>
            THE CANVAS COACH
          </div>
          <p style={{ margin: 0, fontSize: '1.05rem' }}>Taking you to sign in…</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
