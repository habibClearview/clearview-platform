// ============================================================
// ROUTE: /session/[token]
//
// The page a room opens on their phones, from a link or a QR code on the wall.
// No account, no invitation, no password.
//
// The token is resolved by the API route the page calls, not here, because
// everything on this page is live: the room adds and the room reads back, and
// a server-rendered snapshot would be out of date before anybody looked at it.
// What the token is allowed to see is decided server side either way, in
// src/lib/session-link.ts.
//
// Never cached and never indexed. A link meant for one room for one afternoon
// should not end up in a search result, and a page built from a live session
// should not be served from a copy taken before the link was withdrawn.
// ============================================================
import type { Metadata } from 'next'
import SessionCaptureView from '@/components/engagement/SessionCaptureView'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Working session',
  robots: { index: false, follow: false, nocache: true },
}

export default function Page({ params }: { params: { token: string } }) {
  return <SessionCaptureView token={params?.token || ''} />
}
