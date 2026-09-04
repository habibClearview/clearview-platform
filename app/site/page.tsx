import type { Metadata } from 'next'
import CanvasCoachSite from '@/components/site/design/CanvasCoachSite'

export const metadata: Metadata = {
  title: 'Habib Onifade — your work was funded, now it has to sell',
  description: 'Being funded proved the need was real. What changes is who pays. Four advisory methods and one subscription, for organisations that have to start earning what they used to be given.',
  robots: { index: true, follow: true },
  openGraph: { title: 'Habib Onifade — your work was funded, now it has to sell', description: 'Being funded proved the need was real. What changes is who pays. Four advisory methods and one subscription, for organisations that have to start earning what they used to be given.', type: 'website' },
}

export default function Page() {
  return <CanvasCoachSite screen="home" />
}
