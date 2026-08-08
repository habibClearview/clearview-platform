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
  if (!access.canManage) {
    return { error: 'Only the lead consultant can edit or re-issue the Charter', status: 403 as const }
  }
  return { user }
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
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const rl = await checkRateLimit(admin, `charter-version:${auth.user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many changes recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

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
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const rl = await checkRateLimit(admin, `charter-version:${auth.user.id}`, 60, 3600)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many changes recently. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

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
    const { error: supErr } = await admin
      .from('engagement_charters')
      .update({ status: 'superseded', updated_at: now })
      .eq('id', charterId)
    if (supErr) return NextResponse.json({ error: 'Could not supersede the current version' }, { status: 500 })

    const { data: made, error: newErr } = await admin
      .from('engagement_charters')
      .insert({
        client_id: clientId,
        version: (current.version || 1) + 1,
        title: current.title,
        content: current.content,
        status: 'draft',
      })
      .select('id, version')
      .single()
    if (newErr) {
      // Put the old version back rather than leaving the engagement with no
      // live charter at all.
      await admin.from('engagement_charters').update({ status: current.status }).eq('id', charterId)
      return NextResponse.json({ error: 'Could not create the new version' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, version: made.version, charterId: made.id, status: 'draft' })
  } catch (e: any) {
    console.error('charter-version POST: unexpected error', e)
    return NextResponse.json({ error: 'Could not re-issue the Charter' }, { status: 500 })
  }
}
