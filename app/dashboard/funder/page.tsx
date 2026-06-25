'use client'
import { useAuth } from '@/lib/auth/context'
import LoginPage from '@/components/auth/LoginPage'
import CanvasDashboard from '@/components/canvas/CanvasDashboard'

function Loading() {
  return (
    <div style={{ minHeight:'100vh', background:'#F8F4EE', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Georgia, serif', fontSize:'1.1rem', color:'#1B2A4A' }}>
      Loading Clearview…
    </div>
  )
}

export default function FunderPage() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <Loading />
  if (!user) return <LoginPage clientName="Ignite Funder View" />
  return <CanvasDashboard userRole={user.role as any} userName={user.full_name || user.email || 'User'} />
}
