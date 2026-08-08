// ============================================================
// ROUTE: /engagement/[slug]
//
// A thin wrapper. The view itself lives in src/components, because the coach
// dashboard renders the same thing inside its own sidebar and importing a
// route module from a component is not something Next.js supports: a page
// module carries route metadata and segment config that only mean anything at
// the route, and importing it drags all of that into an ordinary render.
// Having one component and two entry points keeps the two views identical
// without asking the framework to do something it does not do.
// ============================================================
import EngagementJourneyView from '@/components/engagement/EngagementJourneyView'

export default function Page() {
  return <EngagementJourneyView />
}
