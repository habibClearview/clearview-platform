import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Contact — tell me where you are stuck',
  description: 'A short note is enough. What you do, who pays for it now, and what happens when that stops.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Contact — tell me where you are stuck', description: 'A short note is enough. What you do, who pays for it now, and what happens when that stops.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="contact" />
}
