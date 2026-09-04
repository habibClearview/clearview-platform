import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Grant to Commercial Viability Canvas — Habib Onifade',
  description: 'Nine decisions, taken in order. Which of your services somebody will pay for, what it really costs to deliver, and who holds that budget.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Grant to Commercial Viability Canvas — Habib Onifade', description: 'Nine decisions, taken in order. Which of your services somebody will pay for, what it really costs to deliver, and who holds that budget.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="gtcv" />
}
