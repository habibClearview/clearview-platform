// ============================================================
// API ROUTE: /api/access-grant/[token]
// Redeems a coach-issued external access token -- an investor,
// programme officer, or subscriber visiting the link a coach handed
// them, with no ClearView login of their own. Uses the service-role
// key and so bypasses RLS entirely, exactly like the existing
// field-sync and provider-webhook routes; the coach-side management of
// these grants (create/list/revoke) goes through the ordinary
// browser Supabase client instead, scoped by RLS (see
// supabase/migrations/2026_07_13_client_access_grants.sql).
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildInvestmentBrief } from '@/lib/investment-brief-builder'
import { isGrantActive, grantStatus } from '@/lib/access-grants'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = params
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const admin = getAdminClient()
    const { data: grant } = await admin.from('client_access_grants').select('*').eq('access_token', token).maybeSingle()

    if (!grant) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })

    const now = new Date().toISOString()
    if (!isGrantActive(grant, now)) {
      const status = grantStatus(grant, now)
      const message = status === 'revoked'
        ? 'This link has been revoked and is no longer active.'
        : 'This link has expired.'
      return NextResponse.json({ error: message }, { status: 410 })
    }

    const { buffer, fileName } = await buildInvestmentBrief(grant.client_id)

    // Best-effort usage tracking -- never blocks the download if it fails.
    await admin.from('client_access_grants').update({ last_accessed_at: now }).eq('id', grant.id)

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
