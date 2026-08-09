// ============================================================
// ROUTE: /engagement/[slug]/charter
//
// A thin wrapper, for the reason set out in the journey route beside it: the
// coach dashboard renders the same Charter inside its sidebar, so the view
// lives in src/components and both entry points render the one component.
// ============================================================
import EngagementCharterView from '@/components/engagement/EngagementCharterView'

export default function Page() {
  return <EngagementCharterView />
}
