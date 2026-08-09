// ============================================================
// API ROUTE: /api/session-link
// Issuing, listing and withdrawing the link a room types into.
//
// A link opens one block of one engagement, optionally tied to one planned
// session, and stops working at a time the coach sets. Everything about that
// scope lives on the grant row, so the capture route never has to be told which
// engagement it is writing to and can never be persuaded.
//
// SHORT BY DEFAULT. A session is an afternoon, so a link lasts twelve hours
// unless the coach says otherwise, and a week at the outside. The showcase link
// lasts ninety days because it shows nothing; this one accepts writing, so the
// window is the length of the thing it is for.
//
// WITHDRAWING IS IMMEDIATE, and there are two ways: revoke one link, or stop
// the engagement's links altogether by revoking each. Revoking is a timestamp,
// never a delete, so the record still says a link existed and when it closed.
//
// Manage rights throughout. Deciding that a room may write into an engagement
// is not a viewer's decision.
// ============================================================
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { GATE_IDS } from '@/lib/gtcv-gates'
import { SESSION_GRANT_TYPE } from '@/lib/session-link'

const DEFAULT_HOURS = 12
const MAX_HOURS = 24 * 7

type Admin = ReturnType<typeof getAdminClient>

async function requireManager(req: NextRequest, admin: Admin, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can open a session to the room',
    rateLimit: { key: 'session-link', max: 60, windowSeconds: 3600 },
  })
}

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    const { data } = await admin
      .from('client_access_grants')
      .select('id, grantee_name, access_token, scope_dp_id, scope_session_id, created_at, expires_at, revoked_at, last_accessed_at')
      .eq('client_id', clientId)
      .eq('grant_type', SESSION_GRANT_TYPE)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ links: data || [] })
  } catch (e: any) {
    console.error('session-link GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load the session links' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; dpId?: string; sessionId?: string; label?: string; hours?: number
    }
    const clientId = body.clientId
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    if (!body.dpId || !GATE_IDS.includes(body.dpId)) {
      return NextResponse.json({ error: 'Choose which block the room is working on' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    // A session id, when given, has to belong to this engagement. Checked
    // rather than trusted: the pair is what makes the scope mean anything.
    if (body.sessionId) {
      const { data: session } = await admin
        .from('gtcv_sessions').select('id, client_id').eq('id', body.sessionId).maybeSingle()
      if (!session || session.client_id !== clientId) {
        return NextResponse.json({ error: 'That session is not on this engagement' }, { status: 404 })
      }
    }

    const hours = Number.isFinite(body.hours) && body.hours! > 0
      ? Math.min(Math.trunc(body.hours!), MAX_HOURS)
      : DEFAULT_HOURS
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()

    const { data, error } = await admin
      .from('client_access_grants')
      .insert({
        client_id: clientId,
        grantee_name: (body.label || '').trim().slice(0, 120) || 'Working session',
        grant_type: SESSION_GRANT_TYPE,
        access_token: randomBytes(32).toString('hex'),
        scope_dp_id: body.dpId,
        scope_session_id: body.sessionId || null,
        expires_at: expiresAt,
        granted_by: auth.userId,
      })
      .select('id, access_token, expires_at, scope_dp_id, scope_session_id, grantee_name')
      .single()

    if (error) {
      console.error('session-link POST: write failed', error)
      return NextResponse.json({ error: 'Could not open the session' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, link: data })
  } catch (e: any) {
    console.error('session-link POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not open the session' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { clientId, id } = (await req.json()) as { clientId?: string; id?: string }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)

    // Revoked, not deleted, and only within this engagement. The record should
    // still say a link existed and when it stopped working.
    const { error } = await admin
      .from('client_access_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('client_id', clientId)
      .eq('grant_type', SESSION_GRANT_TYPE)
    if (error) {
      console.error('session-link DELETE: write failed', error)
      return NextResponse.json({ error: 'Could not close that link' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('session-link DELETE: unexpected error', e)
    return NextResponse.json({ error: 'Could not close that link' }, { status: 500 })
  }
}
