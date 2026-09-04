import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'The Investment Case Canvas — Habib Onifade',
  description: 'Turned down without a reason? Usually the case was built with the ask first and the evidence last. Eight steps, then a fork.',
  robots: { index: true, follow: true },
  openGraph: { title: 'The Investment Case Canvas — Habib Onifade', description: 'Turned down without a reason? Usually the case was built with the ask first and the evidence last. Eight steps, then a fork.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="icc" />
}
