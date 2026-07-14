// ============================================================
// API ROUTE: /api/portfolio-brief
// Coach-triggered download of the portfolio (or filtered segment) as a
// Word document -- see src/lib/portfolio-brief-builder.ts for the
// document, and app/api/portfolio-intelligence/route.ts for the same
// auth pattern this mirrors. The token-based external access route
// (app/api/access-grant/[token]/route.ts) produces the exact same
// document for a portfolio/segment-scoped grant, from the exact same
// builder, so a coach's own download and whatever they hand an investor
// are never two different documents drifting apart.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { loadAllClientSnapshots, buildPortfolioViewData } from '@/lib/portfolio-snapshot-loader'
import { buildPortfolioBrief } from '@/lib/portfolio-brief-builder'
import type { SegmentFilter } from '@/lib/portfolio-intelligence'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const { requesterToken, filter } = await req.json() as { requesterToken: string; filter?: SegmentFilter }

    const admin = getAdminClient()
    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const snapshots = await loadAllClientSnapshots(admin)
    const scopeFilter = filter ?? null
    const data = buildPortfolioViewData(snapshots, scopeFilter)
    const { buffer, fileName } = await buildPortfolioBrief(data, scopeFilter ? 'segment' : 'portfolio', scopeFilter)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Portfolio brief error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: err.status || 500 })
  }
}
