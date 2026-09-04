import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Enterprise Trade Liquidity Multiplier — Habib Onifade',
  description: 'Money that sits still is worth more than money you lend out. Visible reserves mobilise your suppliers\\u2019 own credit.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Enterprise Trade Liquidity Multiplier — Habib Onifade', description: 'Money that sits still is worth more than money you lend out. Visible reserves mobilise your suppliers\\u2019 own credit.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="tralimm" />
}
