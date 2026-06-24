'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import LoginPage from '@/components/auth/LoginPage'
import CoachDashboard from '@/components/coach/CoachDashboard'

function Loading() {
  return (
    <div style={{minHeight:'100vh',background:'#1B2A4A',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia, serif',fontSize:'1.1rem',color:'#00B4D8'}}>
      Loading Canvas Coach…
    </div>
  )
}

export default function CoachPage() {
  const { user, loading, signOut } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted || loading) return <Loading />

  // Must be super_coach or coach role
  if (!user) {
    return <LoginPage clientName="Canvas Coach — Coach Dashboard" />
  }

  if (user.role !== 'super_coach' && user.role !== 'coach') {
    return (
      <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:'#1B2A4A',marginBottom:'0.5rem'}}>Access restricted</div>
        <div style={{fontSize:'0.85rem',color:'#4A5A6A',marginBottom:'1.5rem'}}>The coach dashboard is only accessible to Canvas Coach staff.</div>
        <button onClick={signOut} style={{fontFamily:'monospace',fontSize:'0.78rem',padding:'0.5rem 1rem',border:'1px solid #D8E0E8',borderRadius:4,background:'transparent',color:'#4A5A6A',cursor:'pointer'}}>Sign out</button>
      </div>
    )
  }

  return <CoachDashboard onSignOut={signOut} />
}
