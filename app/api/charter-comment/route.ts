// ============================================================
// API ROUTE: /api/charter-comment
// The review-before-signature flow on the Engagement Charter.
//   POST  : any party who can view the client adds a comment or a suggestion
//           on a charter section.
//   PATCH : a manager (super_coach or assigned co-implementer) resolves a
//           comment by setting its status to accepted, declined or noted.
//
// Service-role route, so it authenticates the caller and authorizes via
// resolveClientAccess (the same rules as can_view_client / can_manage_client_access).
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'



export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      clientId?: string; charterId?: string; sectionKey?: string
      kind?: 'comment' | 'suggestion'; body?: string
    }
    if (!body.clientId || !body.charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }
    if (!body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'A comment cannot be empty' }, { status: 400 })
    }
    const kind = body.kind === 'suggestion' ? 'suggestion' : 'comment'

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, body.clientId, 'view', {
      rateLimit: { key: 'charter-comment', max: 60, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)
    const access = auth

    // The charter has to belong to this client. Without the check, someone who
    // can view client A could post a comment carrying client B's charter_id,
    // and the Charter page, which reads comments by charter_id, would show it
    // to client B. The composite foreign key added in
    // 2026_08_09_charter_child_integrity.sql stops the write regardless; this
    // turns a database error into a plain answer.
    const { data: parent } = await admin
      .from('engagement_charters')
      .select('id, client_id')
      .eq('id', body.charterId)
      .maybeSingle()
    if (!parent || parent.client_id !== body.clientId) {
      return NextResponse.json({ error: 'Charter not found for this client' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('charter_comments')
      .insert({
        client_id: body.clientId,
        charter_id: body.charterId,
        section_key: body.sectionKey ?? null,
        // The author comes from the caller's profile rather than from the
        // party list, unlike a signature, which is resolved from the party
        // record and never from the request. The difference is deliberate: a
        // comment binds nobody, so attributing it to the account that wrote it
        // is both accurate and sufficient, and someone who can see the Charter
        // but is not a named party should still be able to raise a point on
        // it. A signature is the opposite case, which is why it is stricter.
        author_name: access.fullName,
        author_role: access.role,
        kind,
        body: body.body.trim(),
        status: 'open',
      })
      .select('id')
      .single()
    if (error) {
      console.error('charter-comment POST: write failed', error)
      return NextResponse.json({ error: 'Could not save the comment' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: any) {
    console.error('charter-comment POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not save the comment' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string; clientId?: string; status?: 'open' | 'accepted' | 'declined' | 'noted'
    }
    if (!body.id || !body.clientId) {
      return NextResponse.json({ error: 'Missing id or clientId' }, { status: 400 })
    }
    const allowedStatus = ['open', 'accepted', 'declined', 'noted']
    if (!body.status || !allowedStatus.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireAccess(req, admin, body.clientId, 'manage', {
      deniedMessage: 'Only the lead consultant can resolve a comment',
      rateLimit: { key: 'charter-comment', max: 60, windowSeconds: 3600 },
    })
    if (!auth.ok) return refuseAccess(auth)

    const { error } = await admin
      .from('charter_comments')
      .update({ status: body.status, resolved_by: auth.userId, resolved_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('client_id', body.clientId)
    if (error) {
      console.error('charter-comment PATCH: write failed', error)
      return NextResponse.json({ error: 'Could not update the comment' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('charter-comment PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not update the comment' }, { status: 500 })
  }
}
