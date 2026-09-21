// ============================================================
// API ROUTE: /api/catalogue-pull
//
// The scheduled read. Every night ClearView visits each business's own price
// list and brings back anything that changed.
//
// 20 September 2026. This is the pulling half of the answer to "can clearview
// not update the catalogue on their clearview workspace by collating from the
// system they have already". A coach records the address once, on the
// Connected Systems screen, and nobody sends us anything again.
//
// ONE SOURCE THAT FAILS NEVER STOPS THE REST. A business whose system is down
// records that fact against its own source, with the reason in words, and the
// next business is still read. The coach sees "could not reach their system"
// on the screen rather than nothing at all.
//
// A coach can also run one source immediately, with POST, to check an address
// works without waiting for the night.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/auth/api-authz'
import { resolveFieldAdminActor, actorMayAccessClient, actorMayManageTeam } from '@/lib/auth/field-admin-authz'
import { pullOneSource, recordPullOutcome, type SourceRow, type PullOutcome } from '@/lib/catalogue-pull-runner'

export const dynamic = 'force-dynamic'

/** Vercel Cron sends this header. No secret configured means no scheduled run. */
function scheduleIsAuthentic(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/** The nightly read of every active source. */
export async function GET(req: NextRequest) {
  if (!scheduleIsAuthentic(req)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  try {
    const supabase = getAdminClient()
    const { data: sources } = await supabase
      .from('catalogue_sources')
      .select('id, client_id, business_unit_id, default_plan_line_id, url, auth_header')
      .eq('active', true)

    const outcomes: PullOutcome[] = []
    // Deliberately one at a time. These are outbound calls to other people's
    // systems, some of them small ones, and hitting a dozen at once is how a
    // read turns into a complaint.
    for (const source of (sources || []) as SourceRow[]) {
      const outcome = await pullOneSource(supabase, source)
      await recordPullOutcome(supabase, source.id, outcome)
      outcomes.push(outcome)
    }

    return NextResponse.json({
      read: outcomes.length,
      succeeded: outcomes.filter((o) => o.status === 'ok').length,
      outcomes,
    })
  } catch (e) {
    console.error('Scheduled catalogue pull failed:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** A coach running one source now, to check an address works. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sourceId = body?.source_id
    if (!sourceId) return NextResponse.json({ error: 'source_id required' }, { status: 400 })

    const supabase = getAdminClient()
    const actor = await resolveFieldAdminActor(supabase, req)
    if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Which client this source belongs to is read from the source, never from
    // the request, so naming a client you may reach cannot run a read
    // belonging to one you may not.
    const { data: source } = await supabase
      .from('catalogue_sources')
      .select('id, client_id, business_unit_id, default_plan_line_id, url, auth_header')
      .eq('id', sourceId)
      .maybeSingle()
    if (!source) return NextResponse.json({ error: 'No such source' }, { status: 404 })
    if (!actorMayAccessClient(actor, source.client_id) || !actorMayManageTeam(actor)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const outcome = await pullOneSource(supabase, source as SourceRow)
    await recordPullOutcome(supabase, source.id, outcome)
    return NextResponse.json(outcome)
  } catch (e) {
    console.error('Manual catalogue pull failed:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
