// ============================================================
// ROUTE: /site — the public website at habibonifade.com
//
// A server component so the ten questions are read once, here, from the same
// list the engagement uses, and handed to the page. The browser gets a form,
// not the coaching library.
//
// This is the only page in the application that is meant to be found. The
// platform is deliberately not indexed; this is the opposite.
// ============================================================
import type { Metadata } from 'next'
import SiteLanding from '@/components/site/SiteLanding'
import { READINESS } from '@/lib/readiness-score'

export const metadata: Metadata = {
  title: 'Habib Onifade — from grant funding to earned revenue',
  description:
    'Nine decisions, in order, that take an organisation from grant-funded delivery to services somebody pays for. Score your own organisation in two minutes.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'The grant will end. What are you selling when it does?',
    description:
      'The Grant-to-Commercial Viability Canvas: nine decisions, each closed on evidence. Score your organisation in two minutes.',
    type: 'website',
  },
}

export default function Page() {
  const questions = READINESS.map((q) => ({ id: q.id, question: q.question }))
  return <SiteLanding questions={questions} />
}
