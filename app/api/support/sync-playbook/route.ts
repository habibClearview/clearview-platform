// ============================================================
// API ROUTE: /api/support/sync-playbook  (Clair Step 3)
//
// Mirrors the markdown playbook files (docs/support-playbook/*.md) into the
// support_playbook_entries table so Clair always searches the current knowledge.
//
//   GET  — called by Vercel Cron once a day (see vercel.json). If CRON_SECRET is
//          configured, we require Vercel's "Authorization: Bearer <CRON_SECRET>"
//          header; if it is not set, the endpoint still works (the operation is
//          idempotent and only ever reads committed repo files — no new secret
//          is forced on the user).
//   POST — manual "sync now" for the super coach, verified by their login token.
//
// Both paths use the Supabase service-role key already configured in Vercel.
// Runs on the Node.js runtime because it reads the filesystem.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { syncPlaybook } from '@/lib/support-playbook-loader'

export const runtime = 'nodejs'
// The playbook files live in the repo, so a static build-time cache would go
// stale the moment a file changes; force this route to run per request.
export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is
// set. If we haven't configured one, we don't block the cron (see header note).
function cronAuthorised(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  try {
    const result = await syncPlaybook(getAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    // Loud failure: surface the message so a bad file or DB error is visible in
    // the cron logs rather than silently leaving the table stale.
    console.error('[sync-playbook] cron sync failed:', e?.message || e)
    return NextResponse.json({ ok: false, error: e?.message || 'Sync failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { requesterToken } = (await req.json().catch(() => ({}))) as { requesterToken?: string }
    if (!requesterToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = getAdminClient()

    const { data: { user }, error: authErr } = await admin.auth.getUser(requesterToken)
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Distinguish a failed lookup (server problem) from a genuine "not allowed":
    // treating a DB error as a 403 would hide the real cause.
    if (profileErr && profileErr.code !== 'PGRST116') {
      console.error('[sync-playbook] profile lookup failed:', profileErr.message)
      return NextResponse.json({ error: 'Could not verify permissions' }, { status: 500 })
    }

    // Only the super coach may trigger a manual sync — it rewrites Clair's
    // knowledge for everyone.
    if (!profile || profile.role !== 'super_coach') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const result = await syncPlaybook(admin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[sync-playbook] manual sync failed:', e?.message || e)
    return NextResponse.json({ ok: false, error: e?.message || 'Sync failed' }, { status: 500 })
  }
}
