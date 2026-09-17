'use client'
// ============================================================
// WHO IS ALLOWED TO DRIVE THE SCREEN.
//
// The square code on the holding screen is visible to everybody in the room, so
// on its own it is not a lock. This is the lock: the remote opens only for a
// signed-in coach. Anyone else is told plainly and sent nowhere.
//
// The sign-in itself is the application's own, including the part that brings
// somebody back to the page they were trying to open, so scanning the code,
// signing in and landing on the remote is one movement rather than a scan
// followed by a hunt for the link again.
// ============================================================
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import RequireSignIn from '@/components/auth/RequireSignIn'
import WalkthroughRemote from './WalkthroughRemote'
import { pairingFromLink } from '@/lib/walkthrough/pairing'
import { WALKTHROUGH_CSS } from '@/lib/walkthrough/styles'
import { REMOTE_CSS } from '@/lib/walkthrough/remote-styles'

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="gtcvw gtcvw-remote" data-room="dark">
      <style dangerouslySetInnerHTML={{ __html: WALKTHROUGH_CSS + REMOTE_CSS }} />
      <div className="rm-body"><p className="rm-note">{children}</p></div>
    </div>
  )
}

function CoachOnly({ slug }: { slug: string }) {
  const params = useSearchParams()
  // Both come from the square code on the screen. The four digits name the
  // channel; the key is what the screen checks before it obeys anything. One
  // rule, in one place, so the two ends cannot come to disagree about it.
  const pairing = pairingFromLink((params?.get('s') || '').trim(), (params?.get('k') || '').trim())
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking')

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (!session?.user?.id) { setState('denied'); return }
      const { data } = await supabase
        .from('user_profiles').select('role').eq('id', session.user.id).maybeSingle()
      if (cancelled) return
      setState(data && ['super_coach', 'coach'].includes(String(data.role)) ? 'ok' : 'denied')
    }).catch(() => { if (!cancelled) setState('denied') })
    return () => { cancelled = true }
  }, [])

  if (state === 'checking') return <Message>Checking your sign in.</Message>
  if (state === 'denied') {
    return <Message>This remote is for the coach presenting. Your sign in does not open it.</Message>
  }
  return <WalkthroughRemote slug={slug} pairing={pairing} />
}

export default function RemotePage({ slug }: { slug: string }) {
  return (
    <RequireSignIn>
      <CoachOnly slug={slug} />
    </RequireSignIn>
  )
}
