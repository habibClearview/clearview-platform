// ============================================================
// ROUTE: /how-i-work/<link> — one engagement's own walkthrough.
//
// Generated from the engagement's own record. No page is built by hand per
// client: the link either resolves to an engagement with the walkthrough
// switched on, or it is not found.
//
// A server component on purpose, the same as the showcase link. Everything the
// page can show is what loadWalkthrough returns, and that is an allowlist of
// wording, so there is no larger payload sitting behind it.
//
// Never indexed. A link prepared for one funder should not turn up in a search.
// ============================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Walkthrough from '@/components/walkthrough/Walkthrough'
import { loadWalkthrough } from '@/lib/walkthrough/loader'
import { appBaseUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Grant-to-Commercial Viability Canvas',
  robots: { index: false, follow: false, nocache: true },
}

export default async function Page({ params }: { params: { slug: string } }) {
  const found = await loadWalkthrough(params.slug, appBaseUrl())
  if (!found) notFound()
  return (
    <Walkthrough
      ctx={found.ctx}
      slug={found.slug}
      remotePath={`/how-i-work/${found.slug}/remote`}
    />
  )
}
