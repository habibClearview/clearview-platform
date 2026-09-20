// ============================================================
// API ROUTE: /api/monthly-snapshot
//
// Files one reading per engagement per month into portfolio_snapshots, so the
// platform can eventually say whether an organisation is moving rather than
// only where it stands. See src/lib/monthly-snapshot.ts for the decisions and
// supabase/migrations/2026_09_20_monthly_snapshots.sql for what a reading is.
//
//   GET  runs the check. Called by Vercel Cron once a day, and writes only
//        when this month has no reading yet, so a missed day catches itself up
//        the next morning instead of losing a month nobody notices for a year.
//   POST is the same thing on demand, for the lead consultant, so the first
//        reading can be taken the day this ships rather than on the first of
//        next month.
//
// FAIL CLOSED ON THE SCHEDULE, NOT ON THE WORK. An unset CRON_SECRET means the
// scheduled path refuses, because an endpoint that writes a permanent record
// should not be open to anybody who guesses the address. But one engagement
// that cannot be read never stops the rest: it is recorded as skipped, with the
// reason, and the others are still filed. A gap and a failure are different
// facts and the record keeps both.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { takeMonthlySnapshot } from '@/lib/monthly-snapshot-runner'
import { monthKey } from '@/lib/monthly-snapshot'
import { supabaseServiceKey, supabaseUrl } from '@/lib/supabase-env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = supabaseUrl()
  const key = supabaseServiceKey()
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Vercel Cron sends this header. No secret configured means no scheduled run. */
function scheduleIsAuthentic(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!scheduleIsAuthentic(req)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  try {
    const result = await takeMonthlySnapshot(getAdminClient())
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Monthly snapshot failed:', err)
    return NextResponse.json({ error: 'The reading could not be taken.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { requesterToken?: string; month?: string }
    const admin = getAdminClient()

    const token = (body.requesterToken || '').trim()
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await admin
      .from('user_profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'super_coach') {
      return NextResponse.json({ error: 'Only the lead consultant can take a reading' }, { status: 403 })
    }

    const result = await takeMonthlySnapshot(admin, body.month ? monthKey(body.month) : monthKey())
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Monthly snapshot failed:', err)
    return NextResponse.json({ error: 'The reading could not be taken.' }, { status: 500 })
  }
}
