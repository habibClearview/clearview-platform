// ============================================================
// ROUTE: /how-i-work/remote — the phone remote for the generic walkthrough.
//
// Coach only, the same as the client one. The four digit code comes in on the
// end of the address when the square code on the screen is scanned.
// ============================================================
import type { Metadata } from 'next'
import { Suspense } from 'react'
import RemotePage from '@/components/walkthrough/RemotePage'

export const metadata: Metadata = {
  title: 'Presenter remote',
  robots: { index: false, follow: false, nocache: true },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RemotePage slug="generic" />
    </Suspense>
  )
}
