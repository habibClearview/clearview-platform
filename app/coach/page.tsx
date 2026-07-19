// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CoachDashboard from '@/components/coach/CoachDashboard'

// Previously this page had NO role check at all -- any authenticated
// user of any role landed on the full super_coach dashboard, because
// CoachDashboard's userRole prop defaults to 'super_coach' and this page
// never passed a real one. Only super_coach, coach (co-implementer), and
// funder belong here at all; every other role has its own dashboard
// (/dashboard/[slug]) and is turned away here rather than silently
// getting the coach's full view.
export default function CoachPage() {
  const [status, setStatus] = useState('checking')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/'; return }
      const { data } = await supabase.from('user_profiles')
        .select('role, full_name, co_implementer_id, funder_programme_id')
        .eq('id', session.user.id).single()
      if (!data || !['super_coach', 'coach', 'funder'].includes(data.role)) {
        setStatus('denied')
        return
      }
      setProfile(data)
      setStatus('ready')
    })

    // Lock this window the instant the session ends — even when the sign-out
    // happens in ANOTHER window on the same computer (the browser broadcasts
    // SIGNED_OUT across tabs), or when a revoked session's access token
    // finally expires on a different device. Without this the page only
    // re-checked auth on a full reload, so an already-open window stayed
    // usable until it was refreshed.
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:'monospace',fontSize:'0.85rem',color:'#4A5A6A'}}>
      Loading...
    </div>
  )

  if (status === 'denied') return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:'Georgia,serif',color:'#C0392B',gap:'0.75rem',textAlign:'center',padding:'2rem'}}>
      <div>You don&#39;t have access to the Coach Dashboard.</div>
      <button onClick={handleSignOut} style={{fontFamily:'monospace',fontSize:'0.85rem',padding:'0.5rem 1rem',border:'1px solid #C0392B',borderRadius:6,background:'transparent',color:'#C0392B',cursor:'pointer'}}>Sign out</button>
    </div>
  )

  return <CoachDashboard onSignOut={handleSignOut} userRole={profile.role} userName={profile.full_name || 'User'} coImplementerId={profile.co_implementer_id} funderProgrammeId={profile.funder_programme_id}/>
}
