import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Watch — twenty years of implementation, in short pieces',
  description: 'Lessons from running economic development programmes, and from advising the people who run them now.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Watch — twenty years of implementation, in short pieces', description: 'Lessons from running economic development programmes, and from advising the people who run them now.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="videos" />
}
