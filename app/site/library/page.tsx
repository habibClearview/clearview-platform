import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Library — give an email once, take everything',
  description: 'The readiness diagnostic, the canvas as a wall print, the investment case checklist, and the long edition of the newsletter.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Library — give an email once, take everything', description: 'The readiness diagnostic, the canvas as a wall print, the investment case checklist, and the long edition of the newsletter.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="library" />
}
