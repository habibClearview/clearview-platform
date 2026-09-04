import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Evidence — what the work found',
  description: 'Fifteen engagements and the frameworks behind them. Some of it contradicts what the sector tells itself.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Evidence — what the work found', description: 'Fifteen engagements and the frameworks behind them. Some of it contradicts what the sector tells itself.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="proof" />
}
