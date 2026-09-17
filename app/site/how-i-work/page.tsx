// ============================================================
// ROUTE: /how-i-work — the walkthrough with nobody's name on it.
//
// The version shared with anyone considering this work. It uses the same
// component the client links use, with a context that carries no client data at
// all, so there is nothing here to leak and nothing to switch off.
//
// It is the one walkthrough page that search engines may list.
// ============================================================
import type { Metadata } from 'next'
import Walkthrough from '@/components/walkthrough/Walkthrough'
import { GENERIC_CONTEXT } from '@/lib/walkthrough/context'
import { remoteWalkthroughUrl } from '@/lib/walkthrough/links'

export const metadata: Metadata = {
  title: 'How the work runs — Grant-to-Commercial Viability Canvas',
  description: 'Eleven decisions, each closing on evidence and signed by the chief executive. How a grant-funded service is taken to paying customers.',
  robots: { index: true, follow: true },
}

export default function Page() {
  return <Walkthrough ctx={GENERIC_CONTEXT} slug="generic" remoteUrl={remoteWalkthroughUrl()} />
}
