import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Contact — tell me where you are stuck',
  description: 'A short note is enough. Your programme, the country, and what you are trying to prove.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Contact — tell me where you are stuck', description: 'A short note is enough. Your programme, the country, and what you are trying to prove.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="contact" />
}
