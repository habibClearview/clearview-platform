// @ts-nocheck
'use client'
// ============================================================
// ROUTE: /dashboard/funder — the programme funder's dashboard
//
// WHAT THIS WAS, AND WHY IT HAD TO GO. 8 September 2026.
//
// This route rendered CanvasDashboard, an early prototype that keeps the whole
// engagement in the browser under one localStorage key and never writes a
// single field to the database. Ikore's name was written into it in eighteen
// places as placeholder text, so a funder of any programme signed in and read
// another client's engagement. Nothing they typed reached Habib, nothing was
// scoped by row-level security, and clearing the browser erased it.
//
// It is also where landingFor('funder') sends people, and where /coach began
// sending funders on 8 September, so the payer recipients of the first welcome
// letters were being pointed at it.
//
// The funder's real dashboard is the one the platform already has: the same
// component the coach and the client use, rendered with role 'funder'. canEdit
// is false for them so nothing is editable, canViewCoachGuidance is false so
// the guidance, the fee and the method notes are not on the menu, and every
// query underneath is scoped by row-level security to the clients under their
// programme. It reads the database, which is the point of having one.
// ============================================================
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CoachDashboard from '@/components/coach/CoachDashboard'
import { markSignedIn, RETURN_TO_KEY, RETURN_TO_AT_KEY } from '@/lib/auth/session-guard'

export default function FunderPage() {
  const [status, setStatus] = useState('checking')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        try {
          localStorage.setItem(RETURN_TO_KEY, '/dashboard/funder')
          localStorage.setItem(RETURN_TO_AT_KEY, String(Date.now()))
        } catch { /* not essential */ }
        window.location.href = '/'
        return
      }
      markSignedIn()
      const { data } = await supabase.from('user_profiles')
        .select('role, full_name, funder_programme_id').eq('id', session.user.id).single()
      if (data?.role === 'super_coach' || data?.role === 'coach') { window.location.href = '/coach'; return }
      if (data && data.role !== 'funder') { window.location.href = '/client'; return }
      if (!data) { setStatus('denied'); return }
      setProfile(data)
      setStatus('ready')
    }).catch(() => setStatus('denied'))

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
      <div>This sign-in is not attached to a programme yet. Your coach can attach it.</div>
      <button onClick={handleSignOut} style={{fontFamily:'var(--cv-font-mono)',fontSize:'0.85rem',padding:'0.5rem 1rem',border:'1px solid #C0392B',borderRadius:6,background:'transparent',color:'#C0392B',cursor:'pointer'}}>Sign out</button>
    </div>
  )

  return (
    <CoachDashboard
      onSignOut={handleSignOut}
      userRole="funder"
      userName={profile.full_name || 'You'}
      coImplementerId={null}
      funderProgrammeId={profile.funder_programme_id || null}
    />
  )
}
