'use client'
// ============================================================
// ROUTE: /engagement/[slug]
//
// A thin wrapper. The view lives in src/components because the coach dashboard
// renders the same thing inside its own sidebar, and importing a route module
// from a component is not something Next.js supports.
//
// The guard is shared with the Charter route. See RequireSignIn for what this
// page did before it had one, and what that cost.
// ============================================================
import RequireSignIn from '@/components/auth/RequireSignIn'
import EngagementJourneyView from '@/components/engagement/EngagementJourneyView'

export default function Page() {
  return (
    <RequireSignIn>
      <EngagementJourneyView />
    </RequireSignIn>
  )
}
