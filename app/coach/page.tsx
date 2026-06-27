// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CoachDashboard from '@/components/CoachDashboard'

export default function CoachPage() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/'
      } else {
        setStatus('ready')
      }
    })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (status !== 'ready') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#F8F4EE',fontFamily:'monospace',fontSize:'0.85rem',color:'#4A5A6A'}}>
      Loading...
    </div>
  )

  return <CoachDashboard onSignOut={handleSignOut} />
}
