'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const CanvasDashboard = dynamic(() => import('@/components/canvas/CanvasDashboard'), { ssr: false })

const ALLOWED_ROLES = ['super_coach', 'co_implementer', 'ceo', 'finance_manager', 'team_member']

export default function CanvasPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
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

      if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
        router.push('/dashboard')
        return
      }

      setRole(profile.role)
      setName(profile.full_name || session.user.email || 'User')
      setLoading(false)
    }
    checkAuth()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F8F4EE' }}>
        <p style={{ color: '#4A5A6A', fontSize: 14, fontFamily: 'sans-serif' }}>Loading...</p>
      </div>
    )
  }

  if (!role) return null

  return <CanvasDashboard userRole={role as any} userName={name} />
}
