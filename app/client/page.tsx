// @ts-nocheck
'use client'
// ============================================================
// ROUTE: /client — the client's own dashboard
//
// The dashboard a client gets was built long ago and had no address. It is the
// same component the coach uses, rendered with the client's role: canEdit,
// canViewCoachGuidance and canRunTheEngagement take out the coaching guidance,
// the fee, the engagement setup screens and the diagnostic, CANVAS_TABS
// filters on those same functions, and every query underneath is scoped by
// row-level security to the one engagement they belong to. It is precisely
// what the "The client" option in the lead consultant's view dropdown shows.
//
// /coach is the only other route that renders it and it admits super_coach and
// coach alone, which is correct and is why a client could never arrive. The
// welcome letter and the sign-in page sent them to /engagement/[slug] instead,
// which is one view of the engagement rather than the place they work.
//
// This route serves that dashboard to the people it was built for and turns
// everybody else towards their own. It grants nothing: the role functions
// decide the screen and the database decides the data, exactly as before.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CoachDashboard from '@/components/coach/CoachDashboard'
import { markSignedIn, RETURN_TO_KEY, RETURN_TO_AT_KEY } from '@/lib/auth/session-guard'

const CLIENT_ROLES = ['ceo', 'finance_manager', 'unit_head', 'accounts_assistant']

export default function ClientPage() {
  const [status, setStatus] = useState('checking')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        // Come back here after signing in, rather than to a dashboard they then
        // have to find their own engagement from.
        try {
          localStorage.setItem(RETURN_TO_KEY, '/client')
          localStorage.setItem(RETURN_TO_AT_KEY, String(Date.now()))
        } catch { /* not essential */ }
        window.location.href = '/'
        return
      }
      markSignedIn()
      const { data } = await supabase.from('user_profiles')
        .select('role, full_name').eq('id', session.user.id).single()
      // The coaching team and the funder each have their own dashboard. Sending
      // them here would show them one engagement through a client's eyes, which
      // is what the preview is for and is not what their sign-in means.
      if (data?.role === 'super_coach' || data?.role === 'coach') { window.location.href = '/coach'; return }
      if (data?.role === 'funder') { window.location.href = '/dashboard/funder'; return }
      if (!data || !CLIENT_ROLES.includes(data.role)) { setStatus('denied'); return }
      setProfile(data)
      setStatus('ready')
    }).catch(() => setStatus('denied'))

    // Lock this window the instant the session ends, including when the sign
    // out happens in another tab on the same computer.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { window.location.href = '/' }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (status === 'checking') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:'var(--cv-font-mono)',fontSize:'0.85rem',color:'#4A5A6A'}}>
      Loading...
    </div>
  )

  if (status === 'denied') return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:'var(--cv-font)',color:'#C0392B',gap:'0.75rem',textAlign:'center',padding:'2rem'}}>
      <div>This sign-in is not attached to an engagement yet. Your coach can attach it.</div>
      <button onClick={handleSignOut} style={{fontFamily:'var(--cv-font-mono)',fontSize:'0.85rem',padding:'0.5rem 1rem',border:'1px solid #C0392B',borderRadius:6,background:'transparent',color:'#C0392B',cursor:'pointer'}}>Sign out</button>
    </div>
  )

  return (
    <CoachDashboard
      onSignOut={handleSignOut}
      userRole={profile.role}
      userName={profile.full_name || 'You'}
      coImplementerId={null}
      funderProgrammeId={null}
    />
  )
}
