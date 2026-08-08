// ============================================================
// API ROUTE: /api/engagement-meeting
// Scheduling for the kickoff and gate sessions.
//   POST  : a manager proposes or confirms a meeting for the engagement.
//   PATCH : a manager updates a meeting's status (confirmed, done, cancelled).
//
// Service-role route; authenticates the caller and requires manage rights
// (super_coach or the assigned co-implementer), matching can_manage_client_access.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { boundedText, isTimestamp, isWebUrl } from '@/lib/validate-input'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'


/**
 * Manage rights on this engagement, through the one shared helper. A local
 * copy in every route is how a security fix lands in one place and leaves the
 * hole in the others.
 */
async function requireManager(req: NextRequest, admin: ReturnType<typeof getAdminClient>, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can change the meetings',
    rateLimit: { key: 'engagement-meeting', max: 60, windowSeconds: 3600 },
  })
}

// The gates a meeting can belong to. Anything else is not a gate, so it is
// stored as no gate rather than as a value nothing will ever match.
const DP_IDS = [
  'setup', 'phase_0',
  'dp01', 'dp02', 'dp03', 'dp04', 'dp05', 'dp06', 'dp07', 'dp08', 'dp09',
  'handover',
]

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; title?: string; purpose?: string; dpId?: string
      startsAt?: string; endsAt?: string; location?: string; meetingUrl?: string
    }
    if (!body.clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, body.clientId)
    if (!auth.ok) return refuseAccess(auth)


    // A meeting link that is not a web address is a way to hand somebody
    // something other than the page they think they are opening, and a date
    // the calendar cannot read is a meeting nobody will be at.
    if (body.meetingUrl && !isWebUrl(body.meetingUrl)) {
      return NextResponse.json({ error: 'The meeting link must be a web address' }, { status: 400 })
    }
    if (body.startsAt && !isTimestamp(body.startsAt)) {
      return NextResponse.json({ error: 'That start time is not a date' }, { status: 400 })
    }
    if (body.endsAt && !isTimestamp(body.endsAt)) {
      return NextResponse.json({ error: 'That end time is not a date' }, { status: 400 })
    }
    const startsAt = body.startsAt ? new Date(body.startsAt).toISOString() : null
    const endsAt = body.endsAt ? new Date(body.endsAt).toISOString() : null
    if (startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json({ error: 'The meeting cannot end before it starts' }, { status: 400 })
    }
    const meetingUrl = body.meetingUrl ? body.meetingUrl.trim() : null

    const { data, error } = await admin
      .from('engagement_meetings')
      .insert({
        client_id: body.clientId,
        title: boundedText(body.title, 200),
        purpose: boundedText(body.purpose, 2000),
        dp_id: DP_IDS.includes(body.dpId as string) ? body.dpId : null,
        starts_at: startsAt,
        ends_at: endsAt,
        location: boundedText(body.location, 300),
        meeting_url: meetingUrl,
        status: 'proposed',
        created_by: auth.userId,
      })
      .select('id')
      .single()
    if (error) {
      console.error('engagement-meeting POST: write failed', error)
      return NextResponse.json({ error: 'Could not create the meeting' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    console.error('engagement-meeting POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not create the meeting' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string; clientId?: string; status?: 'proposed' | 'confirmed' | 'done' | 'cancelled'
    }
    if (!body.id || !body.clientId) {
      return NextResponse.json({ error: 'Missing id or clientId' }, { status: 400 })
    }
    const allowed = ['proposed', 'confirmed', 'done', 'cancelled']
    if (!body.status || !allowed.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, body.clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { error } = await admin
      .from('engagement_meetings')
      .update({ status: body.status })
      .eq('id', body.id)
      .eq('client_id', body.clientId)
    if (error) return NextResponse.json({ error: 'Could not update the meeting' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('engagement-meeting PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not update the meeting' }, { status: 500 })
  }
}
