import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Intervention Design Canvas — Habib Onifade',
  description: 'Your whole programme design on one page, as nine numbered decisions your team, partners and donor can all read.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Intervention Design Canvas — Habib Onifade', description: 'Your whole programme design on one page, as nine numbered decisions your team, partners and donor can all read.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="idcms" />
}
