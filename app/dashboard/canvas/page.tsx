'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import CanvasDashboard from '@/components/canvas/CanvasDashboard'
import type { CanvasRole } from '@/lib/canvas-types'

const ALLOWED_ROLES: CanvasRole[] = ['super_coach', 'co_implementer', 'ceo', 'finance_manager', 'team_member']

export default function CanvasPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [role, setRole] = useState<CanvasRole | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single()

      if (!profile || !ALLOWED_ROLES.includes(profile.role as CanvasRole)) {
        router.push('/dashboard')
        return
      }

      setRole(profile.role as CanvasRole)
      setName(profile.full_name || session.user.email || 'User')
      setLoading(false)
    }
    checkAuth()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F8F4EE', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #D8E0E8', borderTop: '3px solid #00B4D8', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#4A5A6A', fontSize: 14 }}>Loading the GtCV Canvas platform...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!role) return null

  return <CanvasDashboard userRole={role} userName={name} />
}
