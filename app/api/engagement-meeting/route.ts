// ============================================================
// API ROUTE: /api/engagement-meeting
// Scheduling for the kickoff and gate sessions.
//   POST  : a manager proposes or confirms a meeting for the engagement.
//   PATCH : a manager updates a meeting's status (confirmed, done, cancelled).
//
// Service-role route; authenticates the caller and requires manage rights
// (super_coach or the assigned co-implementer), matching can_manage_client_access.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken } from '@/lib/auth/api-authz'
import { resolveClientAccess } from '@/lib/auth/engagement-access'
import { checkRateLimit } from '@/lib/rate-limit'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireManager(req: NextRequest, admin: ReturnType<typeof getAdminClient>, clientId: string) {
  const token = getBearerToken(req)
  if (!token) return { error: 'Not authenticated', status: 401 as const }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { error: 'Not authenticated', status: 401 as const }
  const access = await resolveClientAccess(admin, user.id, clientId)
  if (!access.canManage) return { error: 'Insufficient permissions', status: 403 as const }
  return { user }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; title?: string; purpose?: string; dpId?: string
      startsAt?: string; endsAt?: string; location?: string; meetingUrl?: string
    }
    if (!body.clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, body.clientId)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const rl = await checkRateLimit(admin, `engagement-meeting:${auth.user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many changes recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const { data, error } = await admin
      .from('engagement_meetings')
      .insert({
        client_id: body.clientId,
        title: body.title ?? null,
        purpose: body.purpose ?? null,
        dp_id: body.dpId ?? null,
        starts_at: body.startsAt ?? null,
        ends_at: body.endsAt ?? null,
        location: body.location ?? null,
        meeting_url: body.meetingUrl ?? null,
        status: 'proposed',
        created_by: auth.user.id,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: 'Could not create the meeting' }, { status: 500 })

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
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
