import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Score your organisation — commercial readiness in two minutes',
  description: 'Ten questions, the same ten asked in a first session. Your score, your gaps named, and where your work starts.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Score your organisation — commercial readiness in two minutes', description: 'Ten questions, the same ten asked in a first session. Your score, your gaps named, and where your work starts.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="assess" />
}
