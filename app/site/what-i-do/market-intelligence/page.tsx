import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Market Intelligence — Habib Onifade',
  description: 'Real transaction data from every business in your portfolio, week by week. Who to back, how much they can absorb, and what changes if you do.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Market Intelligence — Habib Onifade', description: 'Real transaction data from every business in your portfolio, week by week. Who to back, how much they can absorb, and what changes if you do.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="intel" />
}
