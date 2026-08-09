// ============================================================
// API ROUTE: /api/charter-version
// Editing and re-issuing the Engagement Charter.
//
//   PATCH : the lead consultant edits the current draft in place. Only a
//           draft can be edited. Once a charter is issued, the wording is
//           what the parties are reviewing, so changing it means issuing a
//           new version rather than quietly rewriting the old one.
//   POST  : re-issue. Supersedes the current version and creates the next
//           one carrying the edited content forward. Signatures belong to
//           the version they were given on, so a new version means everyone
//           signs again. That is the safeguard: nobody stays bound to
//           wording that changed after they agreed to it.
//
// Service-role route, so it authenticates the caller and requires manage
// rights, which matches the method: the lead consultant holds the document.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, refuseAccess, requireAccess } from '@/lib/auth/api-authz'


/**
 * Manage rights on this engagement, through the one shared helper. A local
 * copy in every route is how a security fix lands in one place and leaves the
 * hole in the others.
 */
async function requireManager(req: NextRequest, admin: ReturnType<typeof getAdminClient>, clientId: string) {
  return requireAccess(req, admin, clientId, 'manage', {
    deniedMessage: 'Only the lead consultant can edit or re-issue the Charter',
    rateLimit: { key: 'charter-version', max: 60, windowSeconds: 3600 },
  })
}

/** Edit the current draft in place. */
export async function PATCH(req: NextRequest) {
  try {
    const { clientId, charterId, title, content } = (await req.json()) as {
      clientId?: string; charterId?: string; title?: string; content?: Record<string, unknown>
    }
    if (!clientId || !charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)


    const { data: charter } = await admin
      .from('engagement_charters')
      .select('id, client_id, status')
      .eq('id', charterId)
      .maybeSingle()
    if (!charter || charter.client_id !== clientId) {
      return NextResponse.json({ error: 'Charter not found for this client' }, { status: 404 })
    }
    if (charter.status !== 'draft') {
      return NextResponse.json(
        { error: 'This version has been issued. Re-issue to make changes, so the parties sign the version they agreed.' },
        { status: 409 },
      )
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof title === 'string') patch.title = title
    if (content && typeof content === 'object') patch.content = content

    const { error } = await admin.from('engagement_charters').update(patch).eq('id', charterId)
    if (error) return NextResponse.json({ error: 'Could not save the Charter' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('charter-version PATCH: unexpected error', e)
    return NextResponse.json({ error: 'Could not save the Charter' }, { status: 500 })
  }
}

/**
 * Issue or re-issue. Marks the current version superseded and creates the
 * next one, so signatures always belong to a single agreed wording.
 */
export async function POST(req: NextRequest) {
  try {
    const { clientId, charterId, mode } = (await req.json()) as {
      clientId?: string; charterId?: string; mode?: 'issue' | 'reissue'
    }
    if (!clientId || !charterId) {
      return NextResponse.json({ error: 'Missing clientId or charterId' }, { status: 400 })
    }

    const admin = getAdminClient()
    const auth = await requireManager(req, admin, clientId)
    if (!auth.ok) return refuseAccess(auth)


    const { data: current } = await admin
      .from('engagement_charters')
      .select('id, client_id, version, title, content, status')
      .eq('id', charterId)
      .maybeSingle()
    if (!current || current.client_id !== clientId) {
      return NextResponse.json({ error: 'Charter not found for this client' }, { status: 404 })
    }

    const now = new Date().toISOString()

    // Issuing a draft simply opens it for signature. The wording does not
    // change, so the version number stays and no signatures are affected.
    if (mode !== 'reissue') {
      if (current.status !== 'draft') {
        return NextResponse.json({ error: 'This version is already issued' }, { status: 409 })
      }
      const { error } = await admin
        .from('engagement_charters')
        .update({ status: 'issued', issued_at: now, updated_at: now })
        .eq('id', charterId)
      if (error) return NextResponse.json({ error: 'Could not issue the Charter' }, { status: 500 })
      return NextResponse.json({ ok: true, version: current.version, status: 'issued' })
    }

    // Re-issue: supersede this version and open the next one as a draft
    // carrying the content forward. Existing signatures stay attached to the
    // superseded version, which is the record of what each party agreed to.
    //
    // Only a live version can be re-issued. Re-issuing one that is already
    // superseded would fork the history into two live drafts, and neither
    // would be the version the parties are looking at.
    if (current.status !== 'issued' && current.status !== 'draft') {
      return NextResponse.json(
        { error: 'That version is no longer the live one. Re-issue the current version instead.' },
        { status: 409 },
      )
    }

    // The two writes are guarded rather than transactional, because PostgREST
    // has no transaction across calls. The supersede is conditional on the
    // status still being what was read, so two people pressing Re-issue at the
    // same moment produce one new version rather than two. The second gets a
    // plain answer instead of a fork.
    const { data: superseded, error: supErr } = await admin
      .from('engagement_charters')
      .update({ status: 'superseded', updated_at: now })
      .eq('id', charterId)
      .eq('status', current.status)
      .select('id')
    if (supErr) {
      console.error('charter-version POST: supersede failed', supErr)
      return NextResponse.json({ error: 'Could not supersede the current version' }, { status: 500 })
    }
    if (!superseded || superseded.length === 0) {
      return NextResponse.json(
        { error: 'Somebody else changed this Charter a moment ago. Reload and try again.' },
        { status: 409 },
      )
    }

    // The version number is unique per engagement in the database, so two
    // people re-issuing at the same instant cannot both create version N + 1.
    // The guarded supersede above closes most of that window; this closes the
    // rest, because a check followed by an act is not atomic and only the
    // database can make the pair so.
    const { data: made, error: newErr } = await admin
      .from('engagement_charters')
      .insert({
        client_id: clientId,
        version: (current.version ?? 0) + 1,
        title: current.title,
        content: current.content,
        status: 'draft',
      })
      .select('id, version')
      .single()

    if (newErr) {
      // Put the old version back rather than leaving the engagement with no
      // live charter at all. If even that fails, say so loudly: an engagement
      // whose only charter is marked superseded is a state somebody has to be
      // told about, not one to discover from an empty page.
      const { error: restoreErr } = await admin
        .from('engagement_charters').update({ status: current.status }).eq('id', charterId)
      if (restoreErr) {
        console.error(
          'charter-version POST: could not create the new version AND could not restore the old one. '
          + 'This engagement now has no live charter and needs fixing by hand.',
          { charterId, clientId, newErr, restoreErr },
        )
        return NextResponse.json(
          { error: 'The re-issue failed and could not be undone. Reload the Charter and check which version is live before doing anything else.' },
          { status: 500 },
        )
      }
      console.error('charter-version POST: could not create the new version', newErr)
      if ((newErr as any).code === '23505') {
        return NextResponse.json(
          { error: 'Somebody else re-issued this Charter a moment ago. Reload to see the current version.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: 'Could not create the new version' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, version: made.version, charterId: made.id, status: 'draft' })
  } catch (e: any) {
    console.error('charter-version POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not re-issue the Charter' }, { status: 500 })
  }
}
