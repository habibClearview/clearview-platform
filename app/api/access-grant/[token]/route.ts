// ============================================================
// API ROUTE: /api/access-grant/[token]
// Redeems a coach-issued external access token -- an investor,
// programme officer, DFI, or subscriber visiting the link a coach
// handed them, with no ClearView login of their own. Uses the
// service-role key and so bypasses RLS entirely, exactly like the
// existing field-sync and provider-webhook routes; the coach-side
// management of these grants (create/list/revoke) goes through the
// ordinary browser Supabase client instead, scoped by RLS (see
// supabase/migrations/2026_07_13_client_access_grants.sql and
// 2026_07_13_access_grants_portfolio_scope.sql).
//
// GET returns grant metadata ONLY -- enough for the public /access/[token]
// page to render a "you've been granted access to X" screen and an email
// field, never the underlying data.
//
// POST is the actual redemption: requires the recipient's email if the
// coach set one on the grant (emailSatisfiesGrant), then returns a Word
// document in every case -- the Investment Brief for a 'client' grant,
// or the Portfolio Intelligence brief for a 'portfolio'/'segment' grant
// (the exact same document, and the exact same builder, a coach can
// download for themselves from /api/portfolio-brief).
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildInvestmentBrief } from '@/lib/investment-brief-builder'
import { loadAllClientSnapshots, buildPortfolioViewData } from '@/lib/portfolio-snapshot-loader'
import { buildPortfolioBrief } from '@/lib/portfolio-brief-builder'
import { isGrantActive, grantStatus, emailSatisfiesGrant, requiresEmailConfirmation, GRANT_TYPE_LABELS, GRANT_SCOPE_LABELS, type GrantSegmentFilter } from '@/lib/access-grants'
import type { SegmentFilter } from '@/lib/portfolio-intelligence'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function loadGrantOrThrow(admin: ReturnType<typeof getAdminClient>, token: string) {
  const { data: grant } = await admin.from('client_access_grants').select('*').eq('access_token', token).maybeSingle()
  if (!grant) throw Object.assign(new Error('This link is not valid.'), { status: 404 })

  const now = new Date().toISOString()
  if (!isGrantActive(grant, now)) {
    const status = grantStatus(grant, now)
    const message = status === 'revoked'
      ? 'This link has been revoked and is no longer active.'
      : 'This link has expired.'
    throw Object.assign(new Error(message), { status: 410 })
  }
  return grant
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const admin = getAdminClient()
    const grant = await loadGrantOrThrow(admin, token)

    let scopeDescription = GRANT_SCOPE_LABELS[grant.scope_type as keyof typeof GRANT_SCOPE_LABELS] || 'Access'
    if (grant.scope_type === 'segment' && grant.segment_filter) {
      const f: GrantSegmentFilter = grant.segment_filter
      const parts = [f.sector, f.country, f.readinessStage].filter(Boolean)
      if (parts.length > 0) scopeDescription = `Segment: ${parts.join(' · ')}`
    }

    return NextResponse.json({
      granteeName: grant.grantee_name,
      grantTypeLabel: GRANT_TYPE_LABELS[grant.grant_type as keyof typeof GRANT_TYPE_LABELS] || grant.grant_type,
      scopeType: grant.scope_type,
      scopeDescription,
      requiresEmail: requiresEmailConfirmation(grant),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: err.status || 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const { email } = await req.json().catch(() => ({})) as { email?: string }

    const admin = getAdminClient()
    const grant = await loadGrantOrThrow(admin, token)

    if (requiresEmailConfirmation(grant)) {
      if (!email) return NextResponse.json({ error: 'Enter the email address this link was sent to.', requiresEmail: true }, { status: 401 })
      if (!emailSatisfiesGrant(grant, email)) {
        return NextResponse.json({ error: "That email doesn't match the one this link was sent to.", requiresEmail: true }, { status: 401 })
      }
    }

    const now = new Date().toISOString()
    await admin.from('client_access_grants').update({
      last_accessed_at: now,
      ...(grant.email_confirmed_at ? {} : { email_confirmed_at: now }),
    }).eq('id', grant.id)

    if (grant.scope_type === 'client') {
      if (!grant.client_id) throw Object.assign(new Error('This link has no business attached to it.'), { status: 500 })
      const { buffer, fileName } = await buildInvestmentBrief(grant.client_id)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    // scope_type 'portfolio' or 'segment': same aggregation the coach's
    // own dashboard uses, filtered the same way -- see
    // src/lib/portfolio-snapshot-loader.ts. A 'portfolio' grant passes no
    // filter (the whole portfolio); a 'segment' grant's filter was fixed
    // by the coach at grant-creation time, never chosen by the visitor.
    const snapshots = await loadAllClientSnapshots(admin)
    const filter: SegmentFilter | null = grant.scope_type === 'segment' ? (grant.segment_filter || null) : null
    const data = buildPortfolioViewData(snapshots, filter)
    const { buffer, fileName } = await buildPortfolioBrief(data, grant.scope_type as 'portfolio' | 'segment', filter)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
    console.error('Access grant redemption error:', err)
    return NextResponse.json({ error: err.message || 'An unexpected error occurred' }, { status: err.status || 500 })
  }
}
