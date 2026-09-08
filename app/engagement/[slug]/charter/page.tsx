'use client'
// ============================================================
// ROUTE: /engagement/[slug]/charter
//
// A thin wrapper, for the reason set out in the journey route beside it: the
// coach dashboard renders the same Charter inside its sidebar, so the view
// lives in src/components and both entry points render the one component.
//
// The guard is shared with that route. See RequireSignIn for what these pages
// did before they had one, and what that cost.
// ============================================================
import RequireSignIn from '@/components/auth/RequireSignIn'
import EngagementCharterView from '@/components/engagement/EngagementCharterView'

export default function Page() {
  return (
    <RequireSignIn>
      <EngagementCharterView />
    </RequireSignIn>
  )
}
