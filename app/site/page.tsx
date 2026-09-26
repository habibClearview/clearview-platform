import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

const DESCRIPTION = 'I make the businesses that development programmes back able to pay their own way, and prove it from their own numbers — at design, at partner selection, through delivery, and for two years after close.'

export const metadata: Metadata = {
  title: 'Habib Onifade — commercial viability in development programmes',
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { title: 'Do you want the businesses you back to become commercially viable?', description: DESCRIPTION, type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="home" />
}
