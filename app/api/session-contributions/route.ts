// ============================================================
// API ROUTE: /api/session-contributions
// What the room typed, read by the coach, and marked once it has been used.
//
// The room writes through /api/session-capture with a scoped token. This is the
// other side: the coaching team reading everything a room has added, deciding
// what becomes part of the record, and marking each sentence once it has.
//
// WHY MARKING MATTERS MORE THAN IT LOOKS. A session produces forty sentences
// and eight of them become rows. Without a mark, the coach re-reads all forty
// every time and either misses one or uses one twice, and both of those are
// invisible afterwards. promoted_at is what makes the pile shrink honestly.
//
// Marking is not deleting. The sentence stays, with who said it, because the
// point of going back to a contribution later is usually to go back to the
// person.
//
// View rights to read, manage rights to mark. Reading what the room said is
// part of the engagement; deciding what counts is the coaching team's.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'
import { GATE_IDS } from '@/lib/gtcv-gates'

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId')
    const dpId = req.nextUrl.searchParams.get('dpId')
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    if (dpId && !GATE_IDS.includes(dpId)) {
      return NextResponse.json({ error: 'That is not a block' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'view', {
      rateLimit: { key: 'session-contributions', max: 240, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    let q = admin
      .from('gtcv_session_contributions')
      .select('id, dp_id, session_id, contributor_name, contributor_role, contribution, promoted_at, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (dpId) q = q.eq('dp_id', dpId)

    const { data, error } = await q
    if (error) {
      console.error('session-contributions GET: read failed', error)
      return NextResponse.json({ error: 'Could not load what the rooms have added' }, { status: 500 })
    }

    return NextResponse.json({ contributions: data || [] })
  } catch (e: any) {
    console.error('session-contributions GET: unexpected error', e)
    return NextResponse.json({ error: 'Could not load what the rooms have added' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { clientId, id, used } = (await req.json()) as {
      clientId?: string; id?: string; used?: boolean
    }
    if (!clientId || !id) return NextResponse.json({ error: 'Missing clientId or id' }, { status: 400 })

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, clientId, 'manage', {
      deniedMessage: 'Only the coaching team decides what becomes part of the record',
      rateLimit: { key: 'session-contributions', max: 240, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const now = new Date().toISOString()
    // Scoped to the engagement in the same statement, so an id from another
    // engagement matches nothing rather than being marked.
    const { error } = await admin
      .from('gtcv_session_contributions')
      .update(used === false
        ? { promoted_at: null, promoted_by: null, updated_at: now }
        : { promoted_at: now, promoted_by: auth.userId, updated_at: now })
      .eq('id', id)
      .eq('client_id', clientId)

    if (error) {
      console.error('session-contributions PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not mark that' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('session-contributions PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not mark that' }, { status: 500 })
  }
}
