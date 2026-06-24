'use client'
import dynamic from 'next/dynamic'

const WonderlandPlanner = dynamic(
  () => import('@/components/wonderland/WonderlandDashboard'),
  { ssr: false, loading: () => <div style={{ padding: '3rem', fontFamily: 'Georgia, serif', color: '#1B2A4A' }}>Loading Wonderland model…</div> }
)

export default function WonderlandPage() {
  return <WonderlandPlanner />
}
