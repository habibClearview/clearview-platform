// ============================================================
// ROUTE: /showcase/[token]
//
// The no-login link a prospect can be sent. A server component on purpose:
// everything the page can show is what loadShowcaseView returns, so there is no
// larger payload behind it. Filtering in the browser would filter nothing,
// because the data would already have been sent.
//
// The page shows the method, which is fixed intellectual property and the thing
// being shown off, and how far one engagement has got, as a count. It never
// shows who the engagement is with unless that engagement has agreed to be
// named, and it never shows anything the engagement produced.
//
// Every failure renders the same page. A stranger who learns that a token was
// revoked rather than never issued has learned something about a token they do
// not hold.
// ============================================================
import type { Metadata } from 'next'
import { loadShowcaseView } from '@/lib/showcase-loader'
import ShowcaseView from '@/components/engagement/ShowcaseView'

// Never cached and never indexed. A link meant for one reader should not end
// up in a search result, and a page built from a live engagement should not be
// served from a copy taken before the link was revoked.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Grant-to-Commercial Viability Canvas',
  robots: { index: false, follow: false, nocache: true },
}

export default async function Page({ params }: { params: { token: string } }) {
  const view = await loadShowcaseView(params?.token).catch((e) => {
    console.error('showcase page: loader threw', e)
    return null
  })
  return <ShowcaseView view={view} />
}
