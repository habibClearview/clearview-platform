// ============================================================
// ROUTE: /how-i-work/<link>/remote — the phone remote for one engagement.
//
// Coach only. The page carries no engagement data of its own: everything shown
// on it, including the speaker notes and the screen list, is sent across by the
// screen it is driving, so a remote opened without a screen shows nothing.
// ============================================================
import type { Metadata } from 'next'
import { Suspense } from 'react'
import RemotePage from '@/components/walkthrough/RemotePage'

export const metadata: Metadata = {
  title: 'Presenter remote',
  robots: { index: false, follow: false, nocache: true },
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <RemotePage slug={params.slug} />
    </Suspense>
  )
}
