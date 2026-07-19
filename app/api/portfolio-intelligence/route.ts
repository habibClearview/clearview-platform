// ============================================================
// API ROUTE: /api/portfolio-intelligence
// Aggregated, portfolio-level view across every financial client on the
// platform -- see src/lib/portfolio-intelligence.ts for the aggregation
// math (pure, tested independently) and src/lib/portfolio-snapshot-loader.ts
// for the snapshot construction shared with the token-based external
// access route (app/api/access-grant/[token]/route.ts) so both generate
// identical numbers from identical code.
//
// Restricted to super_coach only for now -- this is Habib's own
// bizdev/programme-design tool (Product Development Specification §5.1),
// not a per-client view a scoped co-implementer or funder needs.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { loadAllClientSnapshots, buildPortfolioViewData } from '@/lib/portfolio-snapshot-loader'
import { computePortfolioOverview, type SegmentFilter } from '@/lib/portfolio-intelligence'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { requesterToken, filter, forceRefresh } = await req.json() as { requesterToken: string; filter?: SegmentFilter; forceRefresh?: boolean }

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const snapshots = await loadAllClientSnapshots(admin, !!forceRefresh)
    if (snapshots.length === 0) {
      return NextResponse.json({ portfolio: computePortfolioOverview([]), segment: filter ? null : null, snapshotCount: 0, profiles: [], filterOptions: { sectors: [], countries: [], programmeIds: [] }, portfolioDimensionFailures: [], segmentDimensionFailures: null })
    }

    const data = buildPortfolioViewData(snapshots, filter ?? null)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Portfolio intelligence error:', err)
    // Only surface the message for controlled client errors (4xx, thrown with a
    // safe message). For unexpected/server errors return a generic message so
    // raw DB/PostgREST detail never reaches the browser.
    const status = err?.status || 500
    if (status >= 500) return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
    return NextResponse.json({ error: err.message || 'Request could not be completed.' }, { status })
  }
}
